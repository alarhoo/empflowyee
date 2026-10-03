import { afterAll, beforeAll, expect, it } from 'vitest'
import { Client } from 'pg'
import { randomUUID, randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { sql, type Kysely } from 'kysely'
import { HcmTenantDatabase } from '@empflowyee/hcm-api-database-kysely'
import { loadSqlMigrations, migrateHcmDatabase } from '@empflowyee/hcm-api-database-migrations'
import { runDevelopmentSeeds } from '@empflowyee/hcm-api-database-seed'
import {
	HcmRuntimeApplication,
	requireAuthenticatedAccount,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import {
	createSessionReader,
	createTenantDirectory,
	HcmRuntimeStore,
	LocalFieldCipher,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import { LeavePolicyCommands } from '@empflowyee/hcm-api-leave-application'
import { KyselyLeavePolicyUnit } from './policy-unit'
import { readLeavePolicyDraft, type LeavePolicyDraft } from '@empflowyee/hcm-leave-contract'
import { KyselyLeavePolicyRepository } from './hcm-api-leave-infrastructure'
import { KyselyLeaveEnrollmentRepository } from './enrollment-repository'
import { KyselyLeaveGrantLedger } from './grant-ledger'
import type { LeaveEnrollmentAdmission } from '@empflowyee/hcm-api-leave-application'

const tenant = 'local-dunder-mifflin',
	account = 'dunder-mifflin/account/david'
const environment = {
	APP_ENVIRONMENT: 'local',
	NODE_ENV: 'test',
	HCM_LOCAL_TENANTS: 'true',
	HCM_LOCAL_SESSION: 'true',
}
let admin: Client,
	runtime: Client,
	database: HcmTenantDatabase<unknown>,
	directory: HcmRuntimeStore,
	actor: AuthenticatedHcmContext
let accessDatabase: HcmAccessDatabase,
	commands: LeavePolicyCommands,
	employee: AuthenticatedHcmContext

const enrollmentCipher = new LocalFieldCipher(randomBytes(32))

it('persists enrollment with an empty account and encrypted immutable eligibility', /** Reload proves admission does not manufacture entitlement and private evidence stays encrypted. */ async () => {
	const input = await enrollmentFixture()
	const saved = await database.transaction(
		actor,
		/** Atomically persist the admitted enrollment and its account. */ (tx) =>
			enrollmentStore(tx).insert(input),
	)
	expect(saved).toMatchObject({
		id: input.id,
		state: 'Active',
		trackingMode: 'Balance',
		revision: 1,
	})
	expect(saved.accountId).toBeTruthy()
	const reloaded = await database.transaction(
		actor,
		/** Reload through the purpose-built projection. */ (tx) => enrollmentStore(tx).read(input.id),
	)
	expect(reloaded).toEqual(saved)
	expect(reloaded).not.toHaveProperty('eligibility_digest')
	const stored = await admin.query(
		'SELECT posted_units::text,reserved_units::text,available_units::text FROM hcm.leave_balance_account WHERE id=$1',
		[saved.accountId],
	)
	expect(stored.rows[0]).toEqual({
		['posted_units']: '0.000000',
		['reserved_units']: '0.000000',
		['available_units']: '0.000000',
	})
	const sealed = (
		await admin.query(
			'SELECT encrypted_eligibility_snapshot,eligibility_key_version FROM hcm.leave_enrollment WHERE id=$1',
			[input.id],
		)
	).rows[0]
	expect(sealed.encrypted_eligibility_snapshot.toString()).not.toContain(input.employmentId)
	await database.transaction(
		actor,
		/** Verify the snapshot is bound to this actual row identity. */ async (tx) => {
			const cipher = enrollmentCipher.bind(tx, tenant)
			const value = {
				ciphertext: sealed.encrypted_eligibility_snapshot,
				keyVersion: sealed.eligibility_key_version,
			}
			const target = {
				table: 'leave_enrollment',
				column: 'encrypted_eligibility_snapshot',
				rowId: input.id,
			}
			expect(JSON.parse(await cipher.decrypt(target, value))).toEqual(input)
			await expect(cipher.decrypt({ ...target, rowId: randomUUID() }, value)).rejects.toThrow()
		},
	)
	await expect(
		runtime.query('UPDATE hcm.leave_balance_account SET posted_units=10 WHERE id=$1', [
			saved.accountId,
		]),
	).rejects.toMatchObject({ code: '23514' })
	await expect(
		runtime.query('UPDATE hcm.leave_enrollment SET revision=revision+1 WHERE id=$1', [input.id]),
	).rejects.toMatchObject({ code: '23514' })
})

it('never creates or accepts an account for Unpaid enrollment', /** A forged Balance account is denied by the tenant, mode and unit composite reference. */ async () => {
	const input = await enrollmentFixture(true)
	const saved = await database.transaction(
		actor,
		/** Persist request-only tracking without a balance row. */ (tx) =>
			enrollmentStore(tx).insert(input),
	)
	expect(saved.trackingMode).toBe('Unpaid')
	expect(saved).not.toHaveProperty('accountId')
	await expect(
		runtime.query(
			"INSERT INTO hcm.leave_balance_account(tenant_id,id,enrollment_id,unit) VALUES($1,$2,$3,'Day')",
			[tenant, randomUUID(), input.id],
		),
	).rejects.toMatchObject({ code: '23503' })
})

it('rejects unpublished, out-of-period and mismatched-unit enrollment atomically', /** SQL checks cannot be bypassed by a faulty application adapter. */ async () => {
	const input = await enrollmentFixture()
	await expect(
		database.transaction(
			actor,
			/** Dates cannot silently cross the configured period. */ (tx) =>
				enrollmentStore(tx).insert({ ...input, effectiveTo: '2027-01-01' }),
		),
	).rejects.toMatchObject({ code: '23514' })
	await expect(
		database.transaction(
			actor,
			/** Account units cannot disagree with the policy type. */ (tx) =>
				enrollmentStore(tx).insert({ ...input, unit: 'Hour' }),
		),
	).rejects.toMatchObject({ code: '23503' })
	const unpublished = await create()
	await expect(
		database.transaction(
			actor,
			/** Draft policies do not authorize enrollment. */ (tx) =>
				enrollmentStore(tx).insert({
					...input,
					policyId: unpublished.id,
					policyVersionId: unpublished.versionId,
					basis: { ...input.basis, policyRevision: 1 },
				}),
		),
	).rejects.toMatchObject({ code: '23514' })
	expect(
		(await admin.query('SELECT id FROM hcm.leave_enrollment WHERE id=$1', [input.id])).rowCount,
	).toBe(0)
})

it('serializes concurrent overlapping enrollment and rolls back incomplete activation', /** Exactly one competing admission commits and a missing account cannot survive commit. */ async () => {
	const input = await enrollmentFixture()
	const results = await Promise.allSettled(
		[input, { ...input, id: randomUUID() }].map(
			/** Race separate transactions for the same employment and policy range. */ (candidate) =>
				database.transaction(
					actor,
					/** Commit only a complete enrollment aggregate. */ (tx) =>
						enrollmentStore(tx).insert(candidate),
				),
		),
	)
	expect(
		results.filter(/** Count committed admissions. */ (result) => result.status === 'fulfilled'),
	).toHaveLength(1)
	expect(
		results.filter(
			/** The competing overlap must fail closed. */ (result) => result.status === 'rejected',
		),
	).toHaveLength(1)
	const incomplete = await enrollmentFixture()
	await expect(
		database.transaction(
			actor,
			/** Attempt a lower-level write omitting the required account. */ async (tx) => {
				await sql`INSERT INTO hcm.leave_enrollment(tenant_id,id,employment_id,policy_id,policy_version_id,period_id,tracking_mode,unit,source,state,effective_from,effective_to,eligibility_digest,encrypted_eligibility_snapshot,eligibility_key_version,created_by_account_id)
      VALUES(${tenant},${incomplete.id},${incomplete.employmentId},${incomplete.policyId},${incomplete.policyVersionId},${incomplete.periodId},'Balance','Day','Eligibility','Active','2026-01-01','2026-12-31',repeat('a',64),decode('aa','hex'),1,${account})`.execute(
			tx,
		)
			},
		),
	).rejects.toMatchObject({ code: '23514' })
	expect(
		(await admin.query('SELECT id FROM hcm.leave_enrollment WHERE id=$1', [incomplete.id]))
			.rowCount,
	).toBe(0)
})

it('keeps period absence honest and denies foreign enrollment access', /** Row policies protect even unfiltered SQL while the repository also rejects tenant rebinding. */ async () => {
	const input = await enrollmentFixture(true)
	await expect(
		database.transaction(
			actor,
			/** The reviewed period revision is part of the immutable admission basis. */ (tx) =>
				enrollmentStore(tx).insert({ ...input, basis: { ...input.basis, periodRevision: 1 } }),
		),
	).rejects.toMatchObject({ code: 'revision-conflict' })
	await database.transaction(
		actor,
		/** Create one current-tenant enrollment to challenge isolation. */ (tx) =>
			enrollmentStore(tx).insert(input),
	)
	await database.transaction(
		actor,
		/** Missing periods do not acquire default dates or Open status. */ async (tx) => {
			expect(await enrollmentStore(tx).periodAt('2025-12-31')).toBeNull()
			expect(await enrollmentStore(tx).periodAt('2026-03-01')).toMatchObject({
				id: input.periodId,
				state: 'Open',
				revision: 2,
			})
			await expect(enrollmentStore(tx, 'foreign').read(input.id)).rejects.toThrow('forbidden')
			await sql`SELECT set_config('hcm.tenant_id','foreign',true)`.execute(tx)
			expect((await sql`SELECT id FROM hcm.leave_enrollment`.execute(tx)).rows).toHaveLength(0)
			expect((await sql`SELECT id FROM hcm.leave_period`.execute(tx)).rows).toHaveLength(0)
			expect((await sql`SELECT id FROM hcm.leave_balance_account`.execute(tx)).rows).toHaveLength(0)
		},
	)
	await expect(
		database.transaction(
			actor,
			/** A foreign employment cannot be referenced through the local tenant. */ (tx) =>
				enrollmentStore(tx).insert({
					...input,
					id: randomUUID(),
					employmentId: 'foreign/employment',
				}),
		),
	).rejects.toMatchObject({ code: '23503' })
})

it('posts exact grant evidence and account projection once across concurrent retries', /** Internal source fixtures exercise the ledger, not an unimplemented approval or production funding command. */ async () => {
	const enrollment = await enrollmentFixture()
	const account = await database.transaction(
		actor,
		/** Create the prerequisite unfunded account. */ (tx) => enrollmentStore(tx).insert(enrollment),
	)
	if (!account.accountId) throw new Error('Balance account required by fixture')
	const input = {
		accountId: account.accountId,
		grantId: randomUUID(),
		grantType: 'Event' as const,
		units: '2.000001',
		effectiveDate: '2026-04-01',
		sourceReference: 'test-source-grant',
		idempotencyKey: randomUUID(),
	}
	const results = await Promise.all(
		[0, 1].map(
			/** Race one immutable source key through separate connections. */ () =>
				database.transaction(
					actor,
					/** The source command has already established authority in this protocol fixture. */ (
						tx,
					) =>
						new KyselyLeaveGrantLedger(tx, tenant, requireAuthenticatedAccount(actor)).postGrant(
							input,
						),
				),
		),
	)
	expect(results[0]).toEqual(results[1])
	expect(results[0]).toMatchObject({ sequence: '1', units: '2.000001', runningUnits: '2.000001' })
	await expect(
		database.transaction(
			actor,
			/** A repeated key cannot change the credited quantity. */ (tx) =>
				new KyselyLeaveGrantLedger(tx, tenant, requireAuthenticatedAccount(actor)).postGrant({
					...input,
					units: '3',
				}),
		),
	).rejects.toMatchObject({ code: 'idempotency-conflict' })
	const next = await database.transaction(
		actor,
		/** Add one millionth without binary floating point. */ (tx) =>
			new KyselyLeaveGrantLedger(tx, tenant, requireAuthenticatedAccount(actor)).postGrant({
				...input,
				grantId: randomUUID(),
				idempotencyKey: randomUUID(),
				units: '0.000001',
			}),
	)
	expect(next).toMatchObject({ sequence: '2', runningUnits: '2.000002' })
	expect(
		(
			await admin.query(
				'SELECT posted_units::text,available_units::text,revision FROM hcm.leave_balance_account WHERE id=$1',
				[account.accountId],
			)
		).rows[0],
	).toEqual({ ['posted_units']: '2.000002', ['available_units']: '2.000002', revision: 3 })
	expect(
		(
			await admin.query('SELECT id FROM hcm.leave_entitlement_grant WHERE enrollment_id=$1', [
				enrollment.id,
			])
		).rowCount,
	).toBe(2)
	const parallel = await Promise.all(
		['0.000001', '0.000002'].map(
			/** Different source effects must serialize on the same account without losing units. */ (
				units,
			) =>
				database.transaction(
					actor,
					/** Each grant remains a separate immutable business key. */ (tx) =>
						new KyselyLeaveGrantLedger(tx, tenant, requireAuthenticatedAccount(actor)).postGrant({
							...input,
							grantId: randomUUID(),
							idempotencyKey: randomUUID(),
							units,
						}),
				),
		),
	)
	expect(
		parallel
			.map(/** Database sequences identify both committed effects. */ (row) => row.sequence)
			.sort(),
	).toEqual(['3', '4'])
	expect(
		(
			await admin.query('SELECT posted_units::text FROM hcm.leave_balance_account WHERE id=$1', [
				account.accountId,
			])
		).rows[0].posted_units,
	).toBe('2.000005')
	await expect(
		runtime.query('UPDATE hcm.leave_balance_transaction SET units_delta=10 WHERE id=$1', [
			next.transactionId,
		]),
	).rejects.toMatchObject({ code: '42501' })
	await expect(
		admin.query('UPDATE hcm.leave_balance_transaction SET units_delta=10 WHERE id=$1', [
			next.transactionId,
		]),
	).rejects.toMatchObject({ code: '23514' })
	await expect(
		runtime.query(
			'UPDATE hcm.leave_balance_account SET posted_units=10,revision=revision+1 WHERE id=$1',
			[account.accountId],
		),
	).rejects.toMatchObject({ code: '23514' })
})

it('rolls grant, posting and account projection back with a failed source command', /** No partial grant or balance survives an error after the database triggers execute. */ async () => {
	const enrollment = await enrollmentFixture()
	const account = await database.transaction(
		actor,
		/** Establish a distinct account for rollback isolation. */ (tx) =>
			enrollmentStore(tx).insert(enrollment),
	)
	if (!account.accountId) throw new Error('Balance account required by fixture')
	const input = {
		accountId: account.accountId,
		grantId: randomUUID(),
		grantType: 'Event' as const,
		units: '1',
		effectiveDate: '2026-04-01',
		sourceReference: 'test-source-grant',
		idempotencyKey: randomUUID(),
	}
	await expect(
		database.transaction(
			actor,
			/** A source failure must undo every nested ledger effect. */ async (tx) => {
				await new KyselyLeaveGrantLedger(tx, tenant, requireAuthenticatedAccount(actor)).postGrant(
					input,
				)
				throw new Error('source failed')
			},
		),
	).rejects.toThrow('source failed')
	expect(
		(await admin.query('SELECT id FROM hcm.leave_entitlement_grant WHERE id=$1', [input.grantId]))
			.rowCount,
	).toBe(0)
	expect(
		(
			await admin.query('SELECT id FROM hcm.leave_balance_transaction WHERE account_id=$1', [
				account.accountId,
			])
		).rowCount,
	).toBe(0)
	expect(
		(
			await admin.query(
				'SELECT posted_units::text,revision FROM hcm.leave_balance_account WHERE id=$1',
				[account.accountId],
			)
		).rows[0],
	).toEqual({ ['posted_units']: '0.000000', revision: 1 })
	await expect(
		database.transaction(
			actor,
			/** The same account is inaccessible through a mismatched tenant binder. */ (tx) =>
				new KyselyLeaveGrantLedger(tx, 'foreign', requireAuthenticatedAccount(actor)).postGrant(
					input,
				),
		),
	).rejects.toThrow('forbidden')
	await expect(
		database.transaction(
			actor,
			/** Effective dates cannot escape the enrollment's explicit period. */ (tx) =>
				new KyselyLeaveGrantLedger(tx, tenant, requireAuthenticatedAccount(actor)).postGrant({
					...input,
					effectiveDate: '2027-01-01',
				}),
		),
	).rejects.toMatchObject({ code: '23514' })
})

it('requires every grant to commit with its matching immutable posting', /** Low-level SQL cannot leave a funded source without a ledger effect or substitute its quantity. */ async () => {
	const enrollment = await enrollmentFixture()
	const saved = await database.transaction(
		actor,
		/** Start from a real empty Balance account. */ (tx) => enrollmentStore(tx).insert(enrollment),
	)
	const grantId = randomUUID(),
		key = randomUUID()
	/** Insert test source evidence only; the deferred constraint demands its matching posting. */
	const insert = async (tx: Kysely<unknown>) => {
		await sql`INSERT INTO hcm.leave_entitlement_grant(tenant_id,id,enrollment_id,unit,grant_type,granted_units,grant_date,source_reference,input_digest,idempotency_key,created_by_account_id)
      VALUES(${tenant},${grantId},${enrollment.id},'Day','Event',1,'2026-04-01','test-source',repeat('a',64),${key}::uuid,${account})`.execute(
			tx,
		)
	}
	await expect(database.transaction(actor, insert)).rejects.toMatchObject({ code: '23514' })
	await expect(
		database.transaction(
			actor,
			/** A posting cannot credit more than the exact source grant. */ async (tx) => {
				await insert(tx)
				await sql`INSERT INTO hcm.leave_balance_transaction(tenant_id,id,account_id,unit,transaction_type,units_delta,effective_date,entitlement_grant_id,idempotency_key,input_digest,posted_by_account_id)
      VALUES(${tenant},${randomUUID()},${saved.accountId},'Day','Grant',2,'2026-04-01',${grantId},${key}::uuid,repeat('a',64),${account})`.execute(
			tx,
		)
			},
		),
	).rejects.toMatchObject({ code: '23514' })
	expect(
		(await admin.query('SELECT id FROM hcm.leave_entitlement_grant WHERE id=$1', [grantId]))
			.rowCount,
	).toBe(0)
	await database.transaction(
		actor,
		/** RLS protects grant and ledger tables even without a tenant predicate. */ async (tx) => {
			await sql`SELECT set_config('hcm.tenant_id','foreign',true)`.execute(tx)
			expect((await sql`SELECT id FROM hcm.leave_entitlement_grant`.execute(tx)).rows).toHaveLength(
				0,
			)
			expect(
				(await sql`SELECT id FROM hcm.leave_balance_transaction`.execute(tx)).rows,
			).toHaveLength(0)
		},
	)
})

/** Establish explicit published policy and period fixtures without claiming a production publication command. */
async function enrollmentFixture(unpaid = false): Promise<LeaveEnrollmentAdmission> {
	const input = draft()
	if (unpaid) {
		input.trackingMode = 'Unpaid'
		input.accrual = { enabled: false }
	}
	const policy = await create(input)
	await admin.query(
		"UPDATE hcm.leave_policy_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id=$2,publication_digest=repeat('a',64) WHERE id=$1",
		[policy.versionId, account],
	)
	await admin.query(
		"INSERT INTO hcm.leave_period(tenant_id,id,code,name,start_date,end_date,created_by_account_id) VALUES($1,'test-leave-period','TEST_PERIOD','Explicit test period','2026-01-01','2026-12-31',$2) ON CONFLICT(tenant_id,code) DO NOTHING",
		[tenant, account],
	)
	await admin.query(
		"UPDATE hcm.leave_period SET state='Open',revision=revision+1 WHERE id='test-leave-period' AND state='Planned'",
	)
	return {
		id: randomUUID(),
		employmentId: 'dunder-mifflin/employment/jim',
		policyId: policy.id,
		policyVersionId: policy.versionId,
		periodId: 'test-leave-period',
		effectiveFrom: '2026-01-01',
		effectiveTo: '2026-12-31',
		trackingMode: input.trackingMode,
		unit: input.unit,
		basis: {
			schemaVersion: 1,
			policyRevision: 2,
			periodRevision: 2,
			workforceDates: [{ workDate: '2026-01-01', inputDigest: 'a'.repeat(64) }],
			matchingRuleIds: ['eligible'],
		},
	}
}

/** Bind the enrollment store to the same verified transaction as its policy dependencies. */
function enrollmentStore(tx: Kysely<unknown>, tenantId = tenant) {
	return new KyselyLeaveEnrollmentRepository(
		tx,
		tenantId,
		account,
		enrollmentCipher.bind(tx, tenantId),
	)
}
/** Restrict every test connection to the disposable harness configuration. */
function connection(role: string): string {
	const value = process.env[`HCM_TEST_${role}`]
	if (!value) throw new Error('Disposable PostgreSQL required')
	return value
}
/** Supply a complete explicit policy fixture, never a production default or grant. */
function draft(): LeavePolicyDraft {
	return readLeavePolicyDraft({
		code: `L_${randomUUID().replaceAll('-', '').toUpperCase()}`,
		name: '  Exact vacation  ',
		description: 'Test policy',
		leaveTypeId: 'leave-test-vac',
		effectiveFrom: '2026-01-01',
		effectiveTo: '2026-12-31',
		trackingMode: 'Balance',
		unit: 'Day',
		eligibility: { workerTypes: [], legalEntityIds: [], minimumServiceDays: 0 },
		eligibilityRules: [
			{ id: 'eligible', priority: 1, effect: 'Include', effectiveFrom: '2026-01-01' },
		],
		datedAssignments: [],
		rounding: { scale: 6, mode: 'Nearest' },
		allowHalfDay: true,
		allowHourly: false,
		maximumBackdatedDays: 0,
		maximumAdvanceDays: 365,
		minimumRequestUnits: '0.000001',
		maximumRequestUnits: '999999999999.999999',
		accrual: {
			enabled: true,
			frequency: 'Monthly',
			timing: 'Arrears',
			proration: 'None',
			waitingPeriodDays: 0,
			unitsPerOccurrence: '2.000001',
		},
		carryForward: { enabled: false },
		noticeMode: 'Warning',
		approvalRules: [
			{
				id: 'manager',
				stage: 1,
				roleCode: 'MANAGER',
				subjectType: 'Leave',
				independent: true,
				source: 'LineManager',
			},
		],
		compOff: { enabled: false },
		encashment: { configured: false, annualOnly: true },
		bridgeRule: 'None',
		blackoutDates: ['2026-12-25'],
		allowOverlap: false,
		negativeBalanceAllowed: false,
		postingPoint: 'OnApproval',
	})
}
/** Bind the real repository inside Runtime's verified tenant transaction. */
function repository(tx: Kysely<unknown>, tenantId = tenant) {
	return new KyselyLeavePolicyRepository(tx, tenantId, account)
}
/** Persist an independent fixture through the production draft repository. */
async function create(input = draft()) {
	const id = randomUUID(),
		versionId = randomUUID()
	await database.transaction(
		actor,
		/** Commit root and typed rules as one unit. */ async (tx) => {
			const store = repository(tx)
			await store.createPolicy(id, input)
			await store.insertVersion({
				id: versionId,
				policyId: id,
				version: 1,
				supersedesId: null,
				draft: input,
			})
		},
	)
	return { id, versionId, input }
}

beforeAll(
	/** Provision only the harness database and seed canonical authenticated identities. */ async () => {
		admin = new Client({ connectionString: connection('MIGRATOR') })
		runtime = new Client({ connectionString: connection('RUNTIME') })
		await admin.connect()
		await runtime.connect()
		await admin.query('DROP SCHEMA IF EXISTS hcm CASCADE')
		const inventory = resolve('libs/hcm/api/database/migrations/sql')
		await migrateHcmDatabase(connection('MIGRATOR'), inventory)
		await runDevelopmentSeeds({
			env: {
				...environment,
				HCM_SEED_TARGET: tenant,
				HCM_SEED_DATABASE_URL: connection('MIGRATOR'),
			},
			manifestDirectory: resolve('libs/hcm/api/database/seed/manifest'),
			migrations: await loadSqlMigrations(inventory),
		})
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		await runtime.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		await admin.query(
			"INSERT INTO hcm.leave_type(tenant_id,id,code,name,category,unit,is_paid,is_sensitive,is_active) VALUES($1,'leave-test-vac','TEST_VAC','Fixture vacation','Annual','Day',true,false,true)",
			[tenant],
		)
		directory = new HcmRuntimeStore(connection('RUNTIME'))
		database = new HcmTenantDatabase({ connectionString: connection('RUNTIME'), maxConnections: 3 })
		const app = new HcmRuntimeApplication(
			createTenantDirectory(environment, directory),
			createSessionReader(environment, directory),
		)
		actor = await app.authenticate(
			await app.resolveTenant('acme.localhost', '127.0.0.1'),
			undefined,
			{ tenantId: tenant, peerAddress: '127.0.0.1', developmentPersona: 'david' },
		)
		employee = await app.authenticate(
			await app.resolveTenant('acme.localhost', '127.0.0.1'),
			undefined,
			{ tenantId: tenant, peerAddress: '127.0.0.1', developmentPersona: 'jim' },
		)
		// Test grants exercise command authorization; production grants use versioned seed tooling.
		await admin.query(
			"INSERT INTO hcm.access_permission(tenant_id,code,description,kind) VALUES($1,'hcm.leave.leave-policies.read','Read policies','business-operation'),($1,'hcm.leave.leave-policies.draft','Draft policies','business-operation')",
			[tenant],
		)
		await admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'tenant-administrator','hcm.leave.leave-policies.read'),($1,'tenant-administrator','hcm.leave.leave-policies.draft')",
			[tenant],
		)
		await admin.query(
			"INSERT INTO hcm.tenant_entitlement(tenant_id,code,enabled) VALUES($1,'hcm.leave',true) ON CONFLICT(tenant_id,code) DO UPDATE SET enabled=true",
			[tenant],
		)
		accessDatabase = new HcmAccessDatabase(connection('RUNTIME'))
		commands = new LeavePolicyCommands(new KyselyLeavePolicyUnit(accessDatabase, enrollmentCipher))
	},
)
afterAll(
	/** Release only suite-owned pools and clients. */ async () => {
		await database?.destroy()
		await accessDatabase?.onApplicationShutdown()
		await directory?.onApplicationShutdown()
		await runtime?.end()
		await admin?.end()
	},
)

it('round-trips typed policy rows without binary decimal loss or narrative trimming', /** A new transaction reloads all explicit configuration from SQL. */ async () => {
	const item = await create()
	const loaded = await database.transaction(
		actor,
		/** Reload by exact stable and version identity. */ (tx) =>
			repository(tx).read(item.id, item.versionId),
	)
	expect(loaded).toMatchObject({
		id: item.id,
		versionId: item.versionId,
		revision: 1,
		state: 'Draft',
		name: '  Exact vacation  ',
		minimumRequestUnits: '0.000001',
		maximumRequestUnits: '999999999999.999999',
		accrual: { unitsPerOccurrence: '2.000001' },
		validation: [],
	})
	expect(loaded?.eligibilityRules).toEqual(item.input.eligibilityRules)
	expect(loaded?.approvalRules).toEqual(item.input.approvalRules)
	expect(loaded?.blackoutDates).toEqual(['2026-12-25'])
	expect(loaded).not.toHaveProperty('created_by_account_id')
})

it('serializes replacement and rolls every typed child back on failure', /** A stale revision cannot overwrite the winner or leave partial rule replacement. */ async () => {
	const item = await create()
	const change = { ...item.input, name: 'Updated', blackoutDates: [] }
	await database.transaction(
		actor,
		/** Store the first current revision. */ (tx) =>
			repository(tx).replace(item.id, item.versionId, 1, change),
	)
	await expect(
		database.transaction(
			actor,
			/** The old revision is no longer writable. */ (tx) =>
				repository(tx).replace(item.id, item.versionId, 1, item.input),
		),
	).rejects.toMatchObject({ code: 'revision-conflict' })
	await expect(
		database.transaction(
			actor,
			/** Simulate a command failing after child replacement. */ async (tx) => {
				await repository(tx).replace(item.id, item.versionId, 2, item.input)
				throw new Error('after-write failure')
			},
		),
	).rejects.toThrow('after-write failure')
	const loaded = await database.transaction(
		actor,
		/** Observe the prior committed version after rollback. */ (tx) =>
			repository(tx).read(item.id, item.versionId),
	)
	expect(loaded).toMatchObject({ revision: 2, name: 'Updated', blackoutDates: [] })
})

it('enforces tenant binding, RLS and composite type ownership', /** Runtime cannot read or reference a policy outside its current tenant. */ async () => {
	const item = await create()
	await database.transaction(
		actor,
		/** Change only the test transaction context to prove unfiltered SQL remains isolated. */ async (
			tx,
		) => {
			await expect(repository(tx, 'foreign').read(item.id, item.versionId)).rejects.toThrow(
				'forbidden',
			)
			await sql`SELECT set_config('hcm.tenant_id','foreign',true)`.execute(tx)
			expect((await sql`SELECT id FROM hcm.leave_policy`.execute(tx)).rows).toEqual([])
			expect(await repository(tx, 'foreign').read(item.id, item.versionId)).toBeNull()
		},
	)
	await expect(
		runtime.query(
			"INSERT INTO hcm.leave_policy(tenant_id,id,code,leave_type_id,unit,created_by_account_id) VALUES('foreign',$1,'FOREIGN','leave-test-vac','Day',$2)",
			[randomUUID(), account],
		),
	).rejects.toMatchObject({ code: '42501' })
	await expect(
		database.transaction(
			actor,
			/** A same-tenant root still cannot reference an absent foreign type. */ (tx) =>
				repository(tx).createPolicy(randomUUID(), { ...draft(), leaveTypeId: 'foreign-type' }),
		),
	).rejects.toMatchObject({ code: '23503' })
	await expect(
		database.transaction(
			actor,
			/** Type and policy units must agree at the composite key. */ (tx) =>
				repository(tx).createPolicy(randomUUID(), { ...draft(), unit: 'Hour' }),
		),
	).rejects.toMatchObject({ code: '23503' })
})

it('keeps incomplete drafts editable and denies publication without lifecycle admission', /** Neither client input nor a runtime SQL update can bypass required configuration and impact review. */ async () => {
	const input = draft()
	delete input.maximumAdvanceDays
	input.accrual = { enabled: true, unitsPerMonth: '2' }
	const item = await create(input)
	const loaded = await database.transaction(
		actor,
		/** Inspect publication errors without granting anything. */ (tx) =>
			repository(tx).read(item.id, item.versionId),
	)
	expect(loaded?.validation).toContainEqual({ field: 'accrual.timing', code: 'required' })
	const publish =
		"UPDATE hcm.leave_policy_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id=$2,publication_digest=repeat('a',64) WHERE id=$1"
	await expect(runtime.query(publish, [item.versionId, account])).rejects.toMatchObject({
		code: '42501',
	})
	await expect(admin.query(publish, [item.versionId, account])).rejects.toMatchObject({
		code: '23514',
	})
	const full = await create()
	// Migrator-only fixture establishes a published row to exercise SQL immutability;
	// it is not a production publication path or application acceptance claim.
	await admin.query(publish, [full.versionId, account])
	await expect(
		runtime.query('DELETE FROM hcm.leave_approval_rule WHERE version_id=$1', [full.versionId]),
	).rejects.toMatchObject({ code: '23514' })
	await expect(
		runtime.query(
			"UPDATE hcm.leave_policy_version SET name='Changed',revision=revision+1 WHERE id=$1",
			[full.versionId],
		),
	).rejects.toMatchObject({ code: '23514' })
	await expect(
		database.transaction(
			actor,
			/** Published payloads cannot return to the draft editor. */ (tx) =>
				repository(tx).replace(full.id, full.versionId, 2, full.input),
		),
	).rejects.toMatchObject({ code: 'version-published' })
})

it('rejects non-finite exact SQL quantities', /** PostgreSQL numeric NaN must not become an apparently positive entitlement. */ async () => {
	await expect(runtime.query("SELECT 'NaN'::hcm.leave_units")).rejects.toMatchObject({
		code: '23514',
	})
	await expect(runtime.query("SELECT '1000000000000'::hcm.leave_units")).rejects.toMatchObject({
		code: '22003',
	})
})

it('commits one policy, receipt and audit under simultaneous same-key commands', /** Real Access transactions serialize browser retries without duplicate effects. */ async () => {
	const input = draft(),
		key = randomUUID()
	const results = await Promise.all(
		[0, 1].map(
			/** Race equivalent requests through independent connections. */ () =>
				commands.create(actor, key, input),
		),
	)
	expect(results[0]).toEqual(results[1])
	expect(
		(await admin.query('SELECT id FROM hcm.leave_policy WHERE code=$1', [input.code])).rows,
	).toHaveLength(1)
	expect(
		(await admin.query('SELECT id FROM hcm.leave_command_receipt WHERE idempotency_key=$1', [key]))
			.rows,
	).toHaveLength(1)
	expect(
		(
			await admin.query(
				"SELECT id FROM hcm.audit_event WHERE request_id=$1 AND action='leave.policy-created'",
				[key],
			)
		).rows,
	).toHaveLength(1)
	await expect(
		commands.create(actor, key, { ...input, name: 'Changed retry' }),
	).rejects.toMatchObject({ code: 'idempotency-conflict' })
	const updated = await commands.update(actor, results[0].id, results[0].versionId, randomUUID(), {
		...input,
		expectedRevision: 1,
		name: 'Updated through command',
	})
	expect(updated.revision).toBe(2)
	expect(await commands.create(actor, key, input)).toEqual(results[0])
	await expect(
		commands.update(actor, updated.id, updated.versionId, randomUUID(), {
			...input,
			expectedRevision: 1,
		}),
	).rejects.toMatchObject({ code: 'revision-conflict' })
})

it('denies absent or revoked permission and entitlement on commands and replay', /** A stored receipt cannot outlive current source authority. */ async () => {
	const input = draft(),
		key = randomUUID()
	const created = await commands.create(actor, key, input)
	await expect(commands.detail(employee, created.id, created.versionId)).rejects.toMatchObject({
		code: 'forbidden',
	})
	await expect(commands.create(employee, randomUUID(), draft())).rejects.toMatchObject({
		code: 'forbidden',
	})
	await admin.query(
		"DELETE FROM hcm.role_permission WHERE role_id='tenant-administrator' AND permission_code='hcm.leave.leave-policies.read'",
	)
	try {
		await expect(commands.create(actor, key, input)).rejects.toMatchObject({ code: 'forbidden' })
	} finally {
		await admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'tenant-administrator','hcm.leave.leave-policies.read')",
			[tenant],
		)
	}
	await admin.query("UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.leave'")
	try {
		await expect(commands.create(actor, randomUUID(), draft())).rejects.toMatchObject({
			code: 'forbidden',
		})
	} finally {
		await admin.query("UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.leave'")
	}
})

it('retains immutable source rules and encrypted reason when creating a successor', /** Copy rules without changing publication evidence or exposing narrative in audit. */ async () => {
	const source = await create(),
		key = randomUUID(),
		reason = '  Renewal\nwith evidence  '
	// Migrator fixture isolates versioning from the unfinished impact/publication workflow.
	await admin.query(
		"UPDATE hcm.leave_policy_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id=$2,publication_digest=repeat('a',64) WHERE id=$1",
		[source.versionId, account],
	)
	const input = { sourceVersionId: source.versionId, expectedRevision: 2, reason }
	const next = await commands.version(actor, source.id, key, input)
	expect(next).toMatchObject({ id: source.id, version: 2, revision: 1, state: 'Draft' })
	expect(next.versionId).not.toBe(source.versionId)
	expect(next.approvalRules).toEqual(source.input.approvalRules)
	expect(await commands.version(actor, source.id, key, input)).toEqual(next)
	expect(await commands.detail(actor, source.id, source.versionId)).toMatchObject({
		state: 'Published',
		revision: 2,
	})
	const evidence = (
		await admin.query(
			'SELECT encrypted_reason,response FROM hcm.leave_command_receipt WHERE idempotency_key=$1',
			[key],
		)
	).rows[0]
	expect(evidence.encrypted_reason).toBeInstanceOf(Buffer)
	expect(evidence.encrypted_reason.toString('utf8')).not.toContain(reason)
	expect(JSON.stringify(evidence.response)).not.toContain('with evidence')
	const audit = (
		await admin.query('SELECT safe_summary FROM hcm.audit_event WHERE request_id=$1', [key])
	).rows[0]
	expect(audit.safe_summary.reason).toBeNull()
	await expect(
		runtime.query('UPDATE hcm.leave_command_receipt SET response=$1 WHERE idempotency_key=$2', [
			'{}',
			key,
		]),
	).rejects.toMatchObject({ code: '42501' })
})

it('pages latest policies on the server and invalidates continuations after filter or source changes', /** Partial browser results cannot be used as a complete sorted policy collection. */ async () => {
	const prefix = `PAGE_${randomUUID().slice(0, 6).toUpperCase()}`
	const first = await commands.create(actor, randomUUID(), {
		...draft(),
		code: `${prefix}_A`,
		name: 'Same name',
	})
	const second = await commands.create(actor, randomUUID(), {
		...draft(),
		code: `${prefix}_B`,
		name: 'Same name',
	})
	const query = new URLSearchParams({ code: prefix, limit: '1', sort: 'code:asc' })
	const page = await commands.list(actor, query)
	expect(page.items.map(/** Compare only safe root identities. */ (row) => row.id)).toEqual([
		first.id,
	])
	expect(page.nextCursor).toMatch(/^[A-Za-z0-9_-]{43}$/)
	const continuation = new URLSearchParams(query)
	continuation.set('cursor', page.nextCursor ?? '')
	expect((await commands.list(actor, continuation)).items[0].id).toBe(second.id)
	const changed = new URLSearchParams(continuation)
	changed.set('sort', 'name:asc')
	await expect(commands.list(actor, changed)).rejects.toMatchObject({ code: 'invalid-request' })
	await commands.create(actor, randomUUID(), { ...draft(), code: `${prefix}_C` })
	await expect(commands.list(actor, continuation)).rejects.toMatchObject({
		code: 'invalid-request',
	})
	const selected = await commands.list(actor, new URLSearchParams({ id: first.id }))
	expect(selected.items).toHaveLength(1)
	expect(selected.items[0].id).toBe(first.id)
	await expect(commands.list(employee, new URLSearchParams())).rejects.toMatchObject({
		code: 'forbidden',
	})
})
