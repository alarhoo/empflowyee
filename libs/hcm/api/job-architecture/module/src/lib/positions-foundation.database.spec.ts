import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { Client, Pool } from 'pg'
import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely'
import { migrateHcmDatabase, loadSqlMigrations } from '@empflowyee/hcm-api-database-migrations'
import { runDevelopmentSeeds } from '@empflowyee/hcm-api-database-seed'
import { KyselyPositionReadPortBinder } from '@empflowyee/hcm-api-job-architecture-infrastructure'
import { KyselyWorkforcePortBinder } from '@empflowyee/hcm-api-workforce-foundation-infrastructure'
import type { PositionReadPort } from '@empflowyee/hcm-api-job-architecture-application'
import type {
	PositionOccupancyPort,
	StructureReferencePort,
} from '@empflowyee/hcm-api-workforce-foundation-application'

const TENANT = 'local-dunder-mifflin'
const TODAY = '2026-09-26'
const P = 'dunder-mifflin/position/'
const TOBY = 'dunder-mifflin/account/toby'
const DAVID = 'dunder-mifflin/account/david'
let admin: Client
let runtime: Kysely<unknown>

/** Rolled back on purpose so each case starts from the seed. */
class Rollback extends Error {}

interface Ports {
	positions: PositionReadPort
	occupancy: PositionOccupancyPort
	structure: StructureReferencePort
	trx: Transaction<unknown>
}

/** Read through the published ports as the restricted runtime role, always rolled back. */
async function read<T>(work: (ports: Ports) => Promise<T>, tenant = TENANT): Promise<T> {
	let result: T | undefined
	try {
		await runtime.transaction().execute(
			/** Install tenant context and run the case. */ async (trx) => {
				await sql`SELECT set_config('hcm.tenant_id', ${tenant}, true)`.execute(trx)
				const actor = { tenantId: tenant, accountId: TOBY }
				const workforce = new KyselyWorkforcePortBinder().bind(trx, actor)
				result = await work({
					positions: new KyselyPositionReadPortBinder(new KyselyWorkforcePortBinder()).bind(
						trx,
						actor,
					),
					occupancy: workforce.occupancy,
					structure: workforce.structure,
					trx,
				})
				throw new Rollback()
			},
		)
	} catch (error) {
		if (!(error instanceof Rollback)) throw error
	}
	return result as T
}

/** Run statements as runtime in one rolled-back transaction and return the SQLSTATE, or 'ok'. */
async function sqlState(statements: ReturnType<typeof sql>[]): Promise<string> {
	try {
		await runtime.transaction().execute(
			/** Tenant context, then the statements. */ async (trx) => {
				await sql`SELECT set_config('hcm.tenant_id', ${TENANT}, true)`.execute(trx)
				for (const statement of statements) await statement.execute(trx)
				throw new Rollback()
			},
		)
		return 'ok'
	} catch (error) {
		if (error instanceof Rollback) return 'ok'
		return (error as { code?: string }).code ?? 'error'
	}
}

/** A new planned position with a draft version, as a Create request stores it. */
const draftPosition = (grade = 'dunder-mifflin/job-grade/v1/G3', fte = 1, headcount = 1) => [
	sql`INSERT INTO hcm.position(tenant_id,id,code,name) VALUES (${TENANT},'np','SCR-NEW','New position')`,
	sql`INSERT INTO hcm.position_version(tenant_id,id,position_id,version_number,job_profile_version_id,job_grade_id,designation_id,legal_entity_id,organisation_id,location_id,position_type,headcount_capacity,fte_capacity,effective_from)
		VALUES (${TENANT},'np-v1','np',1,'dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1',${grade},'dunder-mifflin/designation/sales-representative','dunder-mifflin/legal-entity/dmpc','dunder-mifflin/organisation/scranton','dunder-mifflin/location/scranton','Regular',${headcount},${fte},'2026-10-01')`,
]

/** A submitted change request on the new position with a ready preview and an approval case. */
const pendingCase = [
	...draftPosition(),
	sql`INSERT INTO hcm.position_change_request(tenant_id,id,position_id,request_type,status,proposed_position_version_id,encrypted_reason,reason_key_version,requested_by_account_id)
		VALUES (${TENANT},'r1','np','Create','PendingApproval','np-v1','\\x00'::bytea,1,${TOBY})`,
	sql`INSERT INTO hcm.position_impact_preview(tenant_id,id,position_change_request_id,preview_revision,status,active_assignment_count,assigned_full_time_equivalent,occupancy_complete,child_position_count,downstream_reference_count,source_version_digest,expires_at)
		VALUES (${TENANT},'pv1','r1',1,'Ready',0,0,true,0,0,repeat('a',64),now()+interval '15 minutes')`,
	sql`INSERT INTO hcm.position_approval_case(tenant_id,id,position_change_request_id,subject_version,preview_id,policy_snapshot_digest)
		VALUES (${TENANT},'c1','r1',1,'pv1',repeat('b',64))`,
]

beforeAll(
	/** Migrate and seed the disposable database, then connect as the restricted runtime role. */ async () => {
		const migrator = process.env['HCM_TEST_MIGRATOR']
		const runtimeUrl = process.env['HCM_TEST_RUNTIME']
		if (!migrator || !runtimeUrl) throw new Error('Disposable database required')
		admin = new Client({ connectionString: migrator })
		await admin.connect()
		await admin.query('DROP SCHEMA IF EXISTS hcm CASCADE')
		const inventory = resolve('libs/hcm/api/database/migrations/sql')
		await migrateHcmDatabase(migrator, inventory)
		await runDevelopmentSeeds({
			env: {
				APP_ENVIRONMENT: 'local',
				NODE_ENV: 'test',
				HCM_SEED_TARGET: TENANT,
				HCM_SEED_DATABASE_URL: migrator,
			},
			manifestDirectory: resolve('libs/hcm/api/database/seed/manifest'),
			migrations: await loadSqlMigrations(inventory),
		})
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [TENANT])
		runtime = new Kysely({
			dialect: new PostgresDialect({ pool: new Pool({ connectionString: runtimeUrl, max: 2 }) }),
		})
	},
)
afterAll(
	/** Release connections. */ async () => {
		await runtime?.destroy()
		await admin?.end()
	},
)

describe('positions foundation', /** Migrations 000026–000027 and job.architecture@2. */ () => {
	it('seeds published Scranton positions occupied by the linked assignments', /** Business rule 14. */ async () => {
		const { occupancy, placement, incumbents, requirements } = await read(
			/** Read seeded facts. */ async ({ positions, occupancy }) => ({
				occupancy: await occupancy.occupancy(
					[P + 'SCR-SALES-REP', P + 'SCR-ACCOUNTANT', P + 'SCR-HR-REP', 'unknown'],
					TODAY,
				),
				placement: await positions.placement(P + 'SCR-SALES-REP', TODAY),
				incumbents: await occupancy.incumbents(P + 'SCR-SALES-REP', TODAY, { limit: 25 }),
				requirements: await positions.effectiveRequirements(P + 'SCR-SALES-REP', TODAY),
			}),
		)
		expect(placement).toMatchObject({
			code: 'SCR-SALES-REP',
			lifecycleStatus: 'Open',
			headcountCapacity: 2,
			fteCapacity: 2,
			gradeId: 'dunder-mifflin/job-grade/v1/G3',
		})
		expect(occupancy.get(P + 'SCR-SALES-REP')).toEqual({
			positionId: P + 'SCR-SALES-REP',
			headcount: 1,
			fte: 1,
			complete: true,
		})
		expect(occupancy.get(P + 'SCR-HR-REP')).toMatchObject({ headcount: 1, complete: true })
		// Unlinked ids are complete zeros; they are only asked for known positions.
		expect(occupancy.get('unknown')).toMatchObject({ headcount: 0, fte: 0, complete: true })
		expect(incumbents.items).toEqual([
			expect.objectContaining({
				assignmentId: 'dunder-mifflin/assignment/jim',
				displayName: 'Jim Halpert',
				fullTimeEquivalent: 1,
				primary: true,
			}),
		])
		expect(requirements.length).toBeGreaterThan(0)
		expect(requirements.every(/** No variances yet. */ (item) => item.source === 'Profile')).toBe(
			true,
		)
		// Before the positions existed there is no published version.
		expect(
			await read(
				/** Historic read. */ ({ positions }) =>
					positions.placement(P + 'SCR-SALES-REP', '2004-12-31'),
			),
		).toBeUndefined()
	})

	it('decides capacity by headcount and FTE and fails safe on unknown occupancy', /** DEC-HCM2-007. */ async () => {
		const decisions = await read(
			/** Decide several additions. */ async ({ positions }) => [
				await positions.capacityDecision(P + 'SCR-SALES-REP', TODAY, 1, 1),
				await positions.capacityDecision(P + 'SCR-SALES-REP', TODAY, 1, 0.5),
				await positions.capacityDecision(P + 'SCR-SALES-REP', TODAY, 0, 1.01),
				await positions.capacityDecision(P + 'SCR-ASST-RM', TODAY, 1, 0.1),
				await positions.capacityDecision(P + 'SCR-SALES-REP', '2004-12-31', 1, 1),
			],
		)
		expect(decisions).toEqual([
			'allowed',
			'allowed',
			'capacity-exceeded',
			'capacity-exceeded',
			'not-open',
		])
		// A linked minimal spine assignment makes occupancy unavailable, never zero.
		const migrator = new Kysely<unknown>({
			dialect: new PostgresDialect({
				pool: new Pool({ connectionString: process.env['HCM_TEST_MIGRATOR'], max: 1 }),
			}),
		})
		let unknown: unknown[] = []
		try {
			await migrator.transaction().execute(
				/** Link a spine assignment, read, and roll back. */ async (trx) => {
					await sql`SELECT set_config('hcm.tenant_id', ${TENANT}, true)`.execute(trx)
					await sql`INSERT INTO hcm.assignment(tenant_id,id,employment_id,organisation_id,location_id,job_title,position_id) VALUES (${TENANT},'spine','dunder-mifflin/employment/jim','dunder-mifflin/organisation/scranton','dunder-mifflin/location/scranton','Sales',${P + 'SCR-SALES-REP'})`.execute(
						trx,
					)
					const actor = { tenantId: TENANT, accountId: TOBY }
					unknown = [
						await new KyselyPositionReadPortBinder(new KyselyWorkforcePortBinder())
							.bind(trx, actor)
							.capacityDecision(P + 'SCR-SALES-REP', TODAY, 1, 0.5),
						(
							await new KyselyWorkforcePortBinder()
								.bind(trx, actor)
								.occupancy.occupancy([P + 'SCR-SALES-REP'], TODAY)
						).get(P + 'SCR-SALES-REP'),
					]
					throw new Rollback()
				},
			)
		} catch (error) {
			if (!(error instanceof Rollback)) throw error
		} finally {
			await migrator.destroy()
		}
		expect(unknown).toEqual([
			'occupancy-unknown',
			{ positionId: P + 'SCR-SALES-REP', headcount: null, fte: null, complete: false },
		])
		// A frozen position accepts no one.
		expect(
			await read(
				/** Freeze inside the rolled-back case. */ async ({ positions, trx }) => {
					await sql`UPDATE hcm.position SET lifecycle_status='Frozen' WHERE tenant_id=${TENANT} AND id=${P + 'SCR-SALES-REP'}`.execute(
						trx,
					)
					return positions.capacityDecision(P + 'SCR-SALES-REP', TODAY, 1, 0.5)
				},
			),
		).toBe('not-open')
	})

	it('publishes structure references and labels for position placement', /** TDD-HCM-2-COMMON#ports. */ async () => {
		const { labels, options } = await read(
			/** Read labels and options. */ async ({ structure }) => ({
				labels: await structure.labels(
					'legal-entities',
					['dunder-mifflin/legal-entity/dmpc'],
					TODAY,
				),
				options: await structure.options(
					'designations',
					{ q: 'Sales', limit: 5, sort: 'name:asc', activeOnly: true },
					TODAY,
				),
			}),
		)
		expect(labels.get('dunder-mifflin/legal-entity/dmpc')?.code).toBeTruthy()
		expect(options.items.map(/** Id. */ (item) => item.id)).toContain(
			'dunder-mifflin/designation/sales-representative',
		)
		await expect(
			read(
				/** Unknown reference. */ ({ structure }) =>
					structure.requireReference('units', 'nope', 'unitId', TODAY),
			),
		).rejects.toMatchObject({ code: 'invalid-request' })
	})

	it('holds capacity, grade, range and variance invariants in the database', /** Business rules 2, 7, 8, 10, 12. */ async () => {
		expect(await sqlState(draftPosition())).toBe('ok')
		// The grade must be allowed by the profile version.
		expect(await sqlState(draftPosition('dunder-mifflin/job-grade/v1/G8'))).toBe('23503')
		// FTE capacity never exceeds headcount capacity; capacities are positive.
		expect(await sqlState(draftPosition(undefined, 2, 1))).toBe('23514')
		expect(await sqlState(draftPosition(undefined, 0, 1))).toBe('23514')
		// Published versions of one position never overlap.
		expect(
			await sqlState([
				sql`INSERT INTO hcm.position_version(tenant_id,id,position_id,version_number,job_profile_version_id,job_grade_id,designation_id,legal_entity_id,organisation_id,location_id,position_type,headcount_capacity,fte_capacity,effective_from,status,published_at,source_digest)
					VALUES (${TENANT},'x2',${P + 'SCR-SALES-REP'},2,'dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1','dunder-mifflin/job-grade/v1/G3','dunder-mifflin/designation/sales-representative','dunder-mifflin/legal-entity/dmpc','dunder-mifflin/organisation/scranton','dunder-mifflin/location/scranton','Regular',2,2,'2026-10-01','Published',now(),repeat('c',64))`,
			]),
		).toBe('23P01')
		// Published versions are immutable; their requirements cannot change.
		expect(
			await sqlState([
				sql`UPDATE hcm.position_version SET headcount_capacity=3 WHERE tenant_id=${TENANT} AND id=${P + 'SCR-SALES-REP/v1'}`,
			]),
		).toBe('23514')
		/** A requirement variance on a version. */
		const variance = (version: string, type: string, justification: boolean) =>
			sql`INSERT INTO hcm.position_requirement(tenant_id,id,position_version_id,source_job_profile_requirement_id,requirement_code,variance_type,requirement_type,name,encrypted_justification,justification_key_version)
				VALUES (${TENANT},'q1',${version},${type === 'Add' ? null : sql`(SELECT id FROM hcm.job_profile_requirement WHERE tenant_id=${TENANT} AND job_profile_version_id='dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1' ORDER BY sort_order LIMIT 1)`},
				'EXTRA',${type},'Experience','Extra',${justification ? sql`'\\x00'::bytea` : null},${justification ? 1 : null})`
		expect(await sqlState([variance(P + 'SCR-SALES-REP/v1', 'Add', false)])).toBe('23514')
		expect(await sqlState([...draftPosition(), variance('np-v1', 'Add', false)])).toBe('ok')
		expect(await sqlState([...draftPosition(), variance('np-v1', 'Waive', false)])).toBe('23514')
		expect(await sqlState([...draftPosition(), variance('np-v1', 'Waive', true)])).toBe('ok')
		expect(await sqlState([...draftPosition(), variance('np-v1', 'Add', true)])).toBe('23514')
		// Relationships never self-reference and a position has one solid line at a time.
		expect(
			await sqlState([
				sql`INSERT INTO hcm.position_relationship(tenant_id,id,source_position_id,target_position_id,relationship_type,effective_from)
					VALUES (${TENANT},'rel',${P + 'SCR-HR-REP'},${P + 'SCR-HR-REP'},'SolidLine','2026-01-01')`,
			]),
		).toBe('23514')
		expect(
			await sqlState([
				sql`INSERT INTO hcm.position_relationship(tenant_id,id,source_position_id,target_position_id,relationship_type,effective_from)
					VALUES (${TENANT},'rel',${P + 'SCR-SALES-REP'},${P + 'SCR-ASST-RM'},'SolidLine','2026-01-01')`,
			]),
		).toBe('23P01')
	})

	it('keeps one request in flight, one decision and an independent decider', /** DEC-HCM2-008. */ async () => {
		/** A decision on case c1. */
		const decide = (id: string, account: string) =>
			sql`INSERT INTO hcm.position_decision(tenant_id,id,position_approval_case_id,decision,subject_version,decided_by_account_id,idempotency_key)
				VALUES (${TENANT},${id},'c1','Approved',1,${account},gen_random_uuid())`
		expect(await sqlState([...pendingCase, decide('d1', DAVID)])).toBe('ok')
		expect(await sqlState([...pendingCase, decide('d1', TOBY)])).toBe('23514')
		expect(await sqlState([...pendingCase, decide('d1', DAVID), decide('d2', DAVID)])).toBe('23505')
		expect(
			await sqlState([
				...pendingCase,
				sql`INSERT INTO hcm.position_change_request(tenant_id,id,position_id,request_type,base_position_version_id,encrypted_reason,reason_key_version,requested_by_account_id)
					VALUES (${TENANT},'r2','np','Freeze','np-v1','\\x00'::bytea,1,${TOBY})`,
			]),
		).toBe('23505')
		// Reasons are ciphertext only; a lifecycle request proposes no version.
		expect(
			await sqlState([
				...draftPosition(),
				sql`INSERT INTO hcm.position_change_request(tenant_id,id,position_id,request_type,base_position_version_id,proposed_position_version_id,encrypted_reason,reason_key_version,requested_by_account_id)
					VALUES (${TENANT},'r3','np','Freeze','np-v1','np-v1','\\x00'::bytea,1,${TOBY})`,
			]),
		).toBe('23514')
		// Codes, requesters and decisions are fixed for life.
		expect(
			await sqlState([
				sql`UPDATE hcm.position SET code='SCR-OTHER' WHERE tenant_id=${TENANT} AND id=${P + 'SCR-HR-REP'}`,
			]),
		).toBe('42501')
		expect(
			await sqlState([
				...pendingCase,
				decide('d1', DAVID),
				sql`UPDATE hcm.position_decision SET decision='Rejected' WHERE tenant_id=${TENANT}`,
			]),
		).toBe('42501')
	})

	it('isolates positions by tenant', /** RLS. */ async () => {
		await admin.query("SELECT set_config('hcm.tenant_id','local-other-tenant',false)")
		await admin.query(
			"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES ('local-other-tenant','local-other-tenant','Other','active') ON CONFLICT DO NOTHING",
		)
		const other = await read(
			/** Read as another tenant. */ async ({ positions, occupancy, trx }) => ({
				placement: await positions.placement(P + 'SCR-SALES-REP', TODAY),
				count: (await sql<{ n: number }>`SELECT count(*)::int AS n FROM hcm.position`.execute(trx))
					.rows[0]?.n,
				incumbents: await occupancy.incumbents(P + 'SCR-SALES-REP', TODAY, { limit: 5 }),
			}),
			'local-other-tenant',
		)
		expect(other.placement).toBeUndefined()
		expect(other.count).toBe(0)
		expect(other.incumbents.items).toEqual([])
	})
})
