import { beforeAll, afterAll, expect, it } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { Client, Pool } from 'pg'
import { Kysely, PostgresDialect, sql, type Transaction, type RawBuilder } from 'kysely'
import { migrateHcmDatabase } from '@empflowyee/hcm-api-database-migrations'
import { runIdempotent, commandHash } from '@empflowyee/hcm-api-runtime-application'
import { LocalFieldCipher } from '@empflowyee/hcm-api-runtime-infrastructure'
import { SqlAttendanceCommandReceipts } from './command-receipts'

const tenant = 'attendance-evidence-test',
	other = 'attendance-evidence-other'
const cipher = new LocalFieldCipher(randomBytes(32))
let admin: Client, database: Kysely<unknown>

/** Use only a runtime-role transaction with an explicit local tenant setting. */
async function inTenant<T>(
	tenantId: string,
	work: (transaction: Transaction<unknown>) => Promise<T>,
): Promise<T> {
	return database.transaction().execute(
		/** Install and discard RLS context with the transaction. */ async (transaction) => {
			await sql`SELECT set_config('hcm.tenant_id',${tenantId},true)`.execute(transaction)
			return work(transaction)
		},
	)
}

/** Prove one SQL denial while retaining the enclosing test transaction for subsequent checks. */
async function denied(
	transaction: Transaction<unknown>,
	query: RawBuilder<unknown>,
	code = '23514',
): Promise<void> {
	await sql`SAVEPOINT rejected_command`.execute(transaction)
	try {
		await expect(query.execute(transaction)).rejects.toMatchObject({ code })
	} finally {
		await sql`ROLLBACK TO SAVEPOINT rejected_command`.execute(transaction)
	}
}

/** Execute a deterministic test mutation using the same transaction for its effect and encrypted receipt. */
async function command(
	key: string,
	reason: string,
	failAfterSave = false,
): Promise<{ id: string; revision: number }> {
	return inTenant(
		tenant,
		/** Reuse the canonical receipt algorithm with a real SQL revision mutation. */ async (
			transaction,
		) => {
			const receipts = new SqlAttendanceCommandReceipts(
				transaction,
				tenant,
				'actor-' + tenant,
				cipher.bind(transaction, tenant),
			)
			const response = await runIdempotent(
				receipts,
				'test.configuration',
				key,
				commandHash('policy-v1', { reason }),
				/** Apply exactly once when no identical receipt exists. */ async () => {
					const row = (
						await sql<{
							revision: number
						}>`UPDATE hcm.attendance_policy_version SET revision=revision+1 WHERE tenant_id=${tenant} AND id='policy-v1' RETURNING revision`.execute(
							transaction,
						)
					).rows[0]
					receipts.setEvidence({
						owner: 'Policy',
						versionId: 'policy-v1',
						revision: row.revision,
						reason,
					})
					return { id: 'policy-v1', revision: row.revision }
				},
			)
			if (failAfterSave) throw new Error('Simulated rollback after receipt')
			return response
		},
	)
}

/** Insert a Ready preview bound to the current policy revision and deterministic test-only basis. */
async function preview(
	transaction: Transaction<unknown>,
	id: string,
	conflictCount = 0,
	expired = false,
): Promise<void> {
	await sql`
INSERT INTO hcm.time_configuration_impact_preview(tenant_id,id,actor_account_id,attendance_policy_version_id,source_revision,
  source_digest,from_date,to_date,state,input_revisions,result_digest,affected_employment_count,affected_workday_count,conflict_count,locked_impact,created_at,expires_at)
SELECT ${tenant},${id},${'actor-' + tenant},id,revision,repeat('a',64),'2026-01-01','2026-12-31','Ready','[]',repeat('b',64),0,0,${conflictCount},false,
  clock_timestamp()-interval '1 minute',clock_timestamp()+${expired ? -1 : 600}*interval '1 second'
FROM hcm.attendance_policy_version WHERE tenant_id=${tenant} AND id='policy-v1'
`.execute(transaction)
}

beforeAll(
	/** Refuse non-harness databases, apply canonical SQL and create two minimal independent test tenants. */ async () => {
		const migrator = process.env['HCM_TEST_MIGRATOR'],
			runtimeUrl = process.env['HCM_TEST_RUNTIME']
		if (!migrator || !runtimeUrl) throw new Error('Disposable database required')
		admin = new Client({ connectionString: migrator })
		await admin.connect()
		await admin.query('DROP SCHEMA IF EXISTS hcm CASCADE')
		await migrateHcmDatabase(migrator, resolve('libs/hcm/api/database/migrations/sql'))
		for (const id of [tenant, other]) {
			await admin.query('BEGIN')
			await admin.query("SELECT set_config('hcm.tenant_id',$1,true)", [id])
			await admin.query(
				"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES($1,$1,$1,'active')",
				[id],
			)
			await admin.query(
				"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES($1,'person','Test','Actor','Test Actor')",
				[id],
			)
			await admin.query(
				"INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES($1,$2,'person','test@example.test')",
				[id, 'actor-' + id],
			)
			await admin.query(
				"INSERT INTO hcm.attendance_policy(tenant_id,id,code,created_by_account_id) VALUES($1,'policy','POLICY',$2)",
				[id, 'actor-' + id],
			)
			await admin.query(
				"INSERT INTO hcm.attendance_policy_version(tenant_id,id,policy_id,version_number,name,effective_from,grace_in_minutes,grace_out_minutes,rounding,overtime_enabled,created_by_account_id) VALUES($1,'policy-v1','policy',1,'Test','2026-01-01',0,0,'None',false,$2)",
				[id, 'actor-' + id],
			)
			await admin.query('COMMIT')
		}
		database = new Kysely({
			dialect: new PostgresDialect({ pool: new Pool({ connectionString: runtimeUrl, max: 2 }) }),
		})
	},
)

afterAll(
	/** Close the runtime pool and migrator before disposable PostgreSQL teardown. */ async () => {
		await database?.destroy()
		await admin?.end()
	},
)

it('serializes case-insensitive UUID retries into one effect and immutable encrypted receipt', /** Concurrent calls must return the same durable result and preserve private reasons outside audit/read responses. */ async () => {
	const key = randomUUID(),
		reason = ' Private configuration rationale '
	const [first, second] = await Promise.all([
		command(key, reason),
		command(key.toUpperCase(), reason),
	])
	expect(second).toEqual(first)
	await expect(command(key, 'Changed rationale')).rejects.toMatchObject({
		code: 'idempotency-conflict',
	})
	await inTenant(
		tenant,
		/** Inspect and authenticate the stored owner reason without exposing it in the public response. */ async (
			transaction,
		) => {
			const rows = await sql<{
				id: string
				ciphertext: Buffer
				keyVersion: number
				response: unknown
			}>`SELECT id,encrypted_reason AS ciphertext,reason_key_version AS "keyVersion",response FROM hcm.attendance_command_receipt WHERE tenant_id=${tenant} AND idempotency_key=${key}::uuid`.execute(
				transaction,
			)
			expect(rows.rows).toHaveLength(1)
			const row = rows.rows[0]
			expect(row.response).toEqual(first)
			expect(row.ciphertext.includes(Buffer.from(reason))).toBe(false)
			const bound = cipher.bind(transaction, tenant)
			expect(
				await bound.decrypt(
					{ table: 'attendance_command_receipt', column: 'encrypted_reason', rowId: row.id },
					row,
				),
			).toBe(reason)
			await expect(
				bound.decrypt(
					{
						table: 'attendance_command_receipt',
						column: 'encrypted_reason',
						rowId: 'another-receipt',
					},
					row,
				),
			).rejects.toThrow()
			await denied(
				transaction,
				sql`UPDATE hcm.attendance_command_receipt SET response='{}' WHERE tenant_id=${tenant}`,
				'42501',
			)
			await denied(
				transaction,
				sql`DELETE FROM hcm.attendance_command_receipt WHERE tenant_id=${tenant}`,
				'42501',
			)
		},
	)
})

it('rolls back the business revision and receipt together and then permits the original key to retry', /** A crash after receipt insertion is not a committed result. */ async () => {
	const key = randomUUID()
	const before = await inTenant(
		tenant,
		/** Capture the actual prior revision rather than depending on test order. */ async (
			transaction,
		) =>
			(
				await sql<{
					revision: number
				}>`SELECT revision FROM hcm.attendance_policy_version WHERE tenant_id=${tenant} AND id='policy-v1'`.execute(
					transaction,
				)
			).rows[0].revision,
	)
	await expect(command(key, 'Rollback reason', true)).rejects.toThrow('Simulated rollback')
	await inTenant(
		tenant,
		/** Neither mutation nor receipt may survive the failed transaction. */ async (transaction) => {
			expect(
				(
					await sql`SELECT id FROM hcm.attendance_command_receipt WHERE tenant_id=${tenant} AND idempotency_key=${key}::uuid`.execute(
						transaction,
					)
				).rows,
			).toHaveLength(0)
			expect(
				(
					await sql<{
						revision: number
					}>`SELECT revision FROM hcm.attendance_policy_version WHERE tenant_id=${tenant} AND id='policy-v1'`.execute(
						transaction,
					)
				).rows[0].revision,
			).toBe(before)
		},
	)
	expect((await command(key, 'Rollback reason')).revision).toBe(before + 1)
})

it('fences expired, conflicting, stale and already-consumed preview evidence', /** Publication cannot repurpose or consume an obsolete impact result. */ async () =>
	inTenant(
		tenant,
		/** Exercise durable preview guards independently of application validation. */ async (
			transaction,
		) => {
			for (const [id, conflicts, expired] of [
				['expired', 0, true],
				['conflict', 1, false],
			] as const) {
				await preview(transaction, id, conflicts, expired)
				await denied(
					transaction,
					sql`UPDATE hcm.time_configuration_impact_preview SET state='Consumed',consumed_at=clock_timestamp(),revision=revision+1 WHERE tenant_id=${tenant} AND id=${id}`,
				)
			}
			await preview(transaction, 'stale')
			await sql`UPDATE hcm.attendance_policy_version SET revision=revision+1 WHERE tenant_id=${tenant} AND id='policy-v1'`.execute(
				transaction,
			)
			await denied(
				transaction,
				sql`UPDATE hcm.time_configuration_impact_preview SET state='Consumed',consumed_at=clock_timestamp(),revision=revision+1 WHERE tenant_id=${tenant} AND id='stale'`,
			)
			await preview(transaction, 'ready')
			await denied(
				transaction,
				sql`UPDATE hcm.time_configuration_impact_preview SET result_digest=repeat('c',64),revision=revision+1 WHERE tenant_id=${tenant} AND id='ready'`,
			)
			await sql`UPDATE hcm.time_configuration_impact_preview SET state='Consumed',consumed_at=clock_timestamp(),revision=revision+1 WHERE tenant_id=${tenant} AND id='ready'`.execute(
				transaction,
			)
			await denied(
				transaction,
				sql`UPDATE hcm.time_configuration_impact_preview SET state='Ready',consumed_at=NULL,revision=revision+1 WHERE tenant_id=${tenant} AND id='ready'`,
			)
		},
	))

it('retains tenant ownership and rejects mixed human/workload attribution', /** A source ID or account from another tenant never gives a receipt authority. */ async () =>
	inTenant(
		tenant,
		/** Validate real RLS, foreign actor references and immutable preview identity. */ async (
			transaction,
		) => {
			await denied(
				transaction,
				sql`INSERT INTO hcm.attendance_command_receipt(tenant_id,actor_account_id,operation,idempotency_key,request_hash,response) VALUES(${tenant},${'actor-' + other},'test',${randomUUID()}::uuid,repeat('a',64),'{}')`,
				'23503',
			)
			await denied(
				transaction,
				sql`INSERT INTO hcm.attendance_command_receipt(tenant_id,actor_account_id,actor_kind,workload_code,workload_run_id,operation,idempotency_key,request_hash,response) VALUES(${tenant},${'actor-' + tenant},'Workload','AttendanceResolve',${randomUUID()}::uuid,'test',${randomUUID()}::uuid,repeat('a',64),'{}')`,
			)
			await denied(
				transaction,
				sql`INSERT INTO hcm.attendance_command_receipt(tenant_id,actor_account_id,operation,idempotency_key,request_hash,response) VALUES(${other},${'actor-' + other},'test',${randomUUID()}::uuid,repeat('a',64),'{}')`,
				'42501',
			)
			await sql`SELECT set_config('hcm.tenant_id','',true)`.execute(transaction)
			expect(
				(await sql`SELECT id FROM hcm.attendance_command_receipt`.execute(transaction)).rows,
			).toEqual([])
			expect(
				(await sql`SELECT id FROM hcm.time_configuration_impact_preview`.execute(transaction)).rows,
			).toEqual([])
		},
	))
