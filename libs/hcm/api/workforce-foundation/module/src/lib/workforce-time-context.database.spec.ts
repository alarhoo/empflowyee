import { beforeAll, afterAll, it, expect } from 'vitest'
import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely'
import { Pool } from 'pg'
import { KyselyWorkforceTimeContextBinder } from '@empflowyee/hcm-api-workforce-foundation-infrastructure'
import type {
	WorkforceTimeContextPort,
	WorkforceTimeContextResult,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import { HcmWorkforceFoundationModule } from './hcm-api-workforce-foundation-module'
import { HCM_TEST_TENANT, startHcmTestApi, type HcmTestApi } from './hcm2-test-harness'

let api: HcmTestApi
let runtime: Kysely<unknown>
const employmentId = 'dunder-mifflin/employment/jim'
const workDate = '2026-09-28'
class Rollback extends Error {}

/** Keep scenario changes isolated while exercising the real restricted SQL role and tenant RLS. */
async function readWithin<Result>(
	work: (port: WorkforceTimeContextPort, transaction: Transaction<unknown>) => Promise<Result>,
	boundTenant = HCM_TEST_TENANT,
): Promise<Result> {
	let result: Result | undefined
	try {
		await runtime.transaction().execute(
			/** Bind to a genuine transaction and roll back all test-only changes afterwards. */ async (
				transaction,
			) => {
				await sql`SELECT set_config('hcm.tenant_id',${HCM_TEST_TENANT},true)`.execute(transaction)
				result = await work(
					new KyselyWorkforceTimeContextBinder().bind(transaction, boundTenant),
					transaction,
				)
				throw new Rollback()
			},
		)
	} catch (error) {
		if (!(error instanceof Rollback)) throw error
	}
	return result as Result
}

/** Fail the scenario when known established seed facts are unavailable. */
function available(result: WorkforceTimeContextResult) {
	if (result.state !== 'Available') throw new Error(`Expected available context: ${result.reason}`)
	return result.context
}

beforeAll(
	/** Use only the disposable migration/seed harness and its restricted runtime credentials. */ async () => {
		api = await startHcmTestApi(HcmWorkforceFoundationModule)
		const connectionString = process.env['HCM_TEST_RUNTIME']
		if (!connectionString) throw new Error('Disposable database required')
		runtime = new Kysely({
			dialect: new PostgresDialect({ pool: new Pool({ connectionString, max: 1 }) }),
		})
	},
)
afterAll(
	/** Close both API and projection pools before the disposable container is removed. */ async () => {
		await runtime?.destroy()
		await api?.close()
	},
)

it('returns a minimal deterministic employment-specific basis and detects reference drift', /** A location edit invalidates the input digest even when the employment revision is unchanged. */ async () => {
	await readWithin(
		/** Read before and after a change inside the same tenant transaction. */ async (
			port,
			transaction,
		) => {
			const first = available(await port.read(employmentId, workDate))
			expect(first).toMatchObject({
				employmentId,
				workerId: 'dunder-mifflin/worker/jim',
				workDate,
				legalEntityId: 'dunder-mifflin/legal-entity/dmpc',
			})
			expect(first.assignments.length).toBeGreaterThan(0)
			expect(first.assignments[0].timezone).toBe('America/New_York')
			expect(available(await port.read(employmentId, workDate)).inputDigest).toBe(first.inputDigest)
			expect(JSON.stringify(first)).not.toMatch(/displayName|workEmail|birthDate|reason/)
			await sql`UPDATE hcm.location SET revision=revision+1,timezone='America/Chicago' WHERE tenant_id=${HCM_TEST_TENANT} AND id=${first.assignments[0].locationId}`.execute(
				transaction,
			)
			const changed = available(await port.read(employmentId, workDate))
			expect(changed.inputDigest).not.toBe(first.inputDigest)
			expect(changed.employmentRevision).toBe(first.employmentRevision)
		},
	)
})

it('keeps a second concurrent employment of the same worker separate', /** Leave and attendance basis must follow the selected employment, never merge all assignments of its worker. */ async () => {
	await readWithin(
		/** Create a second legal employer and dated assignment as test-only SQL facts. */ async (
			port,
			transaction,
		) => {
			await sql`INSERT INTO hcm.legal_entity(tenant_id,id,code,name,registered_name,entity_type,country_code,reporting_currency_code) VALUES(${HCM_TEST_TENANT},'time-test-entity','TIME_TEST','Time test','Time test','Other','US','USD')`.execute(
				transaction,
			)
			await sql`INSERT INTO hcm.employment(tenant_id,id,worker_id,organisation_id,legal_entity_id,employment_type,employment_status,hire_date,employment_sequence,is_primary_employment) VALUES(${HCM_TEST_TENANT},'time-second-employment','dunder-mifflin/worker/jim','dunder-mifflin/organisation/company','time-test-entity','Contract','Active','2026-01-01',2,false)`.execute(
				transaction,
			)
			await sql`INSERT INTO hcm.assignment(tenant_id,id,employment_id,organisation_id,location_id,job_title,work_mode,full_time_equivalent,is_primary_assignment,effective_from) VALUES(${HCM_TEST_TENANT},'time-second-assignment','time-second-employment','dunder-mifflin/organisation/scranton','dunder-mifflin/location/scranton','Test role','Remote',0.2,true,'2026-01-01')`.execute(
				transaction,
			)
			const first = available(await port.read(employmentId, workDate))
			const second = available(await port.read('time-second-employment', workDate))
			expect(first.workerId).toBe(second.workerId)
			expect(
				first.assignments.map(
					/** Compare only the assignment identities used for scope and schedule resolution. */ (
						assignment,
					) => assignment.id,
				),
			).not.toContain('time-second-assignment')
			expect(
				second.assignments.map(
					/** The second employment must expose only its own assignment. */ (assignment) =>
						assignment.id,
				),
			).toEqual(['time-second-assignment'])
			expect(second.legalEntityId).toBe('time-test-entity')
			expect(first.inputDigest).not.toBe(second.inputDigest)
		},
	)
})

it('returns explicit missing and out-of-period states without fabricating defaults', /** Incomplete workforce records, invalid zones and missing dated assignments cannot supply a schedule basis. */ async () => {
	await readWithin(
		/** Inject incomplete and invalid facts only in this rolled-back scenario. */ async (
			port,
			transaction,
		) => {
			expect(await port.read('missing-employment', workDate)).toEqual({
				state: 'Unavailable',
				reason: 'employment-unavailable',
			})
			expect(await port.read(employmentId, '1900-01-01')).toEqual({
				state: 'Unavailable',
				reason: 'outside-employment',
			})
			await sql`INSERT INTO hcm.employment(tenant_id,id,worker_id,organisation_id) VALUES(${HCM_TEST_TENANT},'time-incomplete','dunder-mifflin/worker/jim','dunder-mifflin/organisation/company')`.execute(
				transaction,
			)
			expect(await port.read('time-incomplete', workDate)).toEqual({
				state: 'Unavailable',
				reason: 'incomplete-facts',
			})
			const first = available(await port.read(employmentId, workDate))
			await sql`UPDATE hcm.location SET timezone='Unknown/Nowhere' WHERE tenant_id=${HCM_TEST_TENANT} AND id=${first.assignments[0].locationId}`.execute(
				transaction,
			)
			expect(await port.read(employmentId, workDate)).toEqual({
				state: 'Unavailable',
				reason: 'timezone-unavailable',
			})
		},
	)
})

it('cannot read known employment facts under a substituted tenant or an unscoped pool', /** The tenant predicate and RLS cannot be bypassed by the caller-supplied binder arguments. */ async () => {
	await readWithin(
		/** Attempt the known local employment under a foreign owner binding. */ async (port) => {
			expect(await port.read(employmentId, workDate)).toEqual({
				state: 'Unavailable',
				reason: 'employment-unavailable',
			})
		},
		'foreign-tenant',
	)
	expect(
		/** A pool has no transaction-local tenant lifecycle and is not accepted. */ () =>
			new KyselyWorkforceTimeContextBinder().bind(runtime, HCM_TEST_TENANT),
	).toThrow('requires a tenant transaction')
	await readWithin(
		/** Reject a malformed calendar date before sending it to SQL. */ async (port) => {
			await expect(port.read(employmentId, '2026-02-30')).rejects.toThrow()
		},
	)
})
