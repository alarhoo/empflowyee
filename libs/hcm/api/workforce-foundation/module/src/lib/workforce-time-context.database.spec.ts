import { beforeAll, afterAll, it, expect } from 'vitest'
import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely'
import { Pool } from 'pg'
import {
	KyselyWorkforceTimeContextBinder,
	KyselyWorkforceTimeSubjectsBinder,
	KyselyWorkforceApprovalRoutingBinder,
	KyselyWorkforceLeaveEligibilityBinder,
} from '@empflowyee/hcm-api-workforce-foundation-infrastructure'
import type {
	WorkforceTimeContextPort,
	WorkforceTimeContextResult,
	WorkforceTimeTarget,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import { HcmWorkforceFoundationModule } from './hcm-api-workforce-foundation-module'
import { HCM_TEST_TENANT, startHcmTestApi, type HcmTestApi } from './hcm2-test-harness'

let api: HcmTestApi
let runtime: Kysely<unknown>
const employmentId = 'dunder-mifflin/employment/jim'
const workDate = '2026-09-28'
class Rollback extends Error {}

it('exports private eligibility facts only through the dedicated owner port', /** Person changes invalidate Leave evidence without putting gender into general schedule projections. */ async () => {
	await readWithin(
		/** Exercise the real tenant-bound projection and roll back the test person revision. */ async (
			time,
			tx,
		) => {
			const binder = new KyselyWorkforceLeaveEligibilityBinder(
				new KyselyWorkforceTimeContextBinder(),
			)
			const port = binder.bind(tx, HCM_TEST_TENANT)
			const first = await port.read(employmentId, workDate)
			if (first.state !== 'Available') throw new Error('Expected seeded eligibility facts')
			expect(first.context.workforce.employmentId).toBe(employmentId)
			expect(first.context.personRevision).toBeGreaterThan(0)
			expect(first.context).toHaveProperty('genderCode')
			expect(JSON.stringify(first)).not.toMatch(/displayName|birthDate|email|reason|document/)
			expect(available(await time.read(employmentId, workDate))).not.toHaveProperty('genderCode')
			expect(await port.read(employmentId, workDate)).toEqual(first)
			await sql`UPDATE hcm.person SET revision=revision+1 WHERE tenant_id=${HCM_TEST_TENANT} AND id='dunder-mifflin/person/jim'`.execute(
				tx,
			)
			const next = await port.read(employmentId, workDate)
			if (next.state !== 'Available') throw new Error('Expected revised eligibility facts')
			expect(next.context.inputDigest).not.toBe(first.context.inputDigest)
			expect(next.context.workforce.inputDigest).toBe(first.context.workforce.inputDigest)
			await expect(binder.bind(tx, 'foreign').read(employmentId, workDate)).rejects.toThrow(
				'forbidden',
			)
			expect(await port.read('missing-employment', workDate)).toMatchObject({
				state: 'Unavailable',
				reason: 'employment-unavailable',
			})
		},
	)
})

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

it('resolves exact employment manager levels without identity profiles or hierarchy fallback', /** Routing is owner-owned dated evidence and cannot substitute another employment or manager level. */ async () => {
	await readWithin(
		/** Compare seeded routing and fail-closed tenant and missing-level cases. */ async (
			_port,
			tx,
		) => {
			const binder = new KyselyWorkforceApprovalRoutingBinder(),
				routing = binder.bind(tx, HCM_TEST_TENANT)
			const first = await routing.read(employmentId, workDate, 1)
			expect(first).toMatchObject({
				beneficiaryPersonId: 'dunder-mifflin/person/jim',
				managerPersonId: 'dunder-mifflin/person/michael',
			})
			expect(await routing.read(employmentId, workDate, 1)).toEqual(first)
			expect(await routing.read(employmentId, workDate, 2147483647)).toMatchObject({
				managerPersonId: null,
			})
			expect(await routing.read(employmentId, workDate, null)).toMatchObject({
				beneficiaryPersonId: 'dunder-mifflin/person/jim',
				managerPersonId: null,
			})
			expect(JSON.stringify(first)).not.toMatch(/displayName|birthDate|email|reason/)
			expect(await binder.bind(tx, 'foreign').read(employmentId, workDate, 1)).toBeNull()
			expect(await routing.read('missing-employment', workDate, 1)).toBeNull()
			await expect(routing.read(employmentId, workDate, 0)).rejects.toThrow()
			const time = available(await _port.read(employmentId, workDate))
			await sql`UPDATE hcm.assignment SET revision=revision+1 WHERE tenant_id=${HCM_TEST_TENANT} AND id=${time.assignments[0].id}`.execute(
				tx,
			)
			expect((await routing.read(employmentId, workDate, 1))?.digest).not.toBe(first?.digest)
		},
	)
})

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

it('pages employment identities with a deterministic internal keyset and retains incomplete candidates', /** Full dated scope membership is filtered before limit, without leaking names or silently omitting bad source facts. */ async () => {
	await readWithin(
		/** Compare the complete paginated identity set with an independent SQL predicate in the same snapshot. */ async (
			_port,
			transaction,
		) => {
			await sql`INSERT INTO hcm.employment(tenant_id,id,worker_id,organisation_id) VALUES(${HCM_TEST_TENANT},'impact-A','dunder-mifflin/worker/jim','dunder-mifflin/organisation/company'),(${HCM_TEST_TENANT},'impact-a','dunder-mifflin/worker/jim','dunder-mifflin/organisation/company')`.execute(
				transaction,
			)
			const subjects = new KyselyWorkforceTimeSubjectsBinder().bind(transaction, HCM_TEST_TENANT)
			const expected = await sql<{
				id: string
			}>`SELECT id FROM hcm.employment WHERE tenant_id=${HCM_TEST_TENANT} AND (hire_date IS NULL OR hire_date<=${workDate}::date) AND (employment_end_date IS NULL OR employment_end_date>=${workDate}::date) ORDER BY id COLLATE "C"`.execute(
				transaction,
			)
			const collected: string[] = []
			let after: string | undefined
			for (let index = 0; index < 100; index++) {
				const page = await subjects.page(workDate, { kind: 'Tenant' }, after, 3)
				expect(page.items.length).toBeLessThanOrEqual(3)
				for (const item of page.items) {
					expect(Object.keys(item).sort()).toEqual(['employmentId', 'employmentRevision'])
					expect(item.employmentRevision).toBeGreaterThan(0)
					collected.push(item.employmentId)
				}
				if (page.nextAfterEmploymentId === null) break
				expect(page.nextAfterEmploymentId).toBe(page.items.at(-1)?.employmentId)
				after = page.nextAfterEmploymentId
			}
			expect(collected).toEqual(
				expected.rows.map(
					/** Compare exact database identity order without locale-specific JavaScript sorting. */ (
						row,
					) => row.id,
				),
			)
			expect(new Set(collected).size).toBe(collected.length)
			expect(collected).toContain('impact-A')
			expect(collected).toContain('impact-a')
			expect((await subjects.page(workDate, { kind: 'Employment', id: 'impact-A' })).items).toEqual(
				[{ employmentId: 'impact-A', employmentRevision: 1 }],
			)
		},
	)
})

it('filters all dated scope kinds before paging and deduplicates multiple matching assignments', /** Multiple assignments cannot double-count an employment or make unrelated targets eligible. */ async () => {
	await readWithin(
		/** Resolve authoritative scope facts and add a second matching assignment only for this scenario. */ async (
			port,
			transaction,
		) => {
			const facts = available(await port.read(employmentId, workDate)),
				assignment = facts.assignments[0]
			const subjects = new KyselyWorkforceTimeSubjectsBinder().bind(transaction, HCM_TEST_TENANT)
			const targets: WorkforceTimeTarget[] = [
				{ kind: 'Employment', id: employmentId },
				{ kind: 'Assignment', id: assignment.id },
				{ kind: 'LegalEntity', id: facts.legalEntityId },
				{ kind: 'OrgUnit', id: assignment.orgUnitId },
				{ kind: 'Location', id: assignment.locationId },
			]
			if (assignment.departmentId) targets.push({ kind: 'Department', id: assignment.departmentId })
			else throw new Error('Expected seeded department')
			for (const target of targets)
				expect(
					(await subjects.page(workDate, target, undefined, 100)).items.some(
						/** The exact employment must appear in each of its effective source scopes. */ (
							item,
						) => item.employmentId === employmentId,
					),
				).toBe(true)
			expect(
				(await subjects.page(workDate, { kind: 'Assignment', id: assignment.id })).items,
			).toEqual([{ employmentId, employmentRevision: facts.employmentRevision }])
			await sql`INSERT INTO hcm.assignment(tenant_id,id,employment_id,organisation_id,location_id,job_title,work_mode,full_time_equivalent,is_primary_assignment,effective_from) VALUES(${HCM_TEST_TENANT},'impact-secondary',${employmentId},${assignment.orgUnitId},${assignment.locationId},'Test','Remote',0.1,false,'2026-09-28')`.execute(
				transaction,
			)
			await sql`UPDATE hcm.assignment SET effective_to='2026-09-29',revision=revision+1 WHERE tenant_id=${HCM_TEST_TENANT} AND id='impact-secondary'`.execute(
				transaction,
			)
			const matching = await subjects.page(
				workDate,
				{ kind: 'Location', id: assignment.locationId },
				undefined,
				100,
			)
			expect(
				matching.items.filter(
					/** EXISTS must return one employment despite two matching assignments. */ (item) =>
						item.employmentId === employmentId,
				),
			).toHaveLength(1)
			expect(
				(await subjects.page('2026-09-27', { kind: 'Assignment', id: 'impact-secondary' })).items,
			).toHaveLength(0)
			expect(
				(await subjects.page('2026-09-29', { kind: 'Assignment', id: 'impact-secondary' })).items,
			).toHaveLength(1)
			expect(
				(await subjects.page('2026-09-30', { kind: 'Assignment', id: 'impact-secondary' })).items,
			).toHaveLength(0)
			expect(
				(await subjects.page(workDate, { kind: 'Location', id: 'missing' })).items,
			).toHaveLength(0)
		},
	)
})

it('includes ended employments on their covered historical dates without requiring an assignment', /** Current status does not erase historical impact, and no-assignment facts stay visible for explicit downstream unavailability. */ async () => {
	await readWithin(
		/** Arrange a separate employment whose two-day coverage has already ended. */ async (
			port,
			transaction,
		) => {
			await sql`INSERT INTO hcm.legal_entity(tenant_id,id,code,name,registered_name,entity_type,country_code,reporting_currency_code) VALUES(${HCM_TEST_TENANT},'impact-entity','IMPACT_ENTITY','Impact','Impact','Other','US','USD')`.execute(
				transaction,
			)
			await sql`INSERT INTO hcm.employment(tenant_id,id,worker_id,organisation_id,legal_entity_id,employment_type,employment_status,hire_date,employment_sequence,is_primary_employment) VALUES(${HCM_TEST_TENANT},'impact-ended','dunder-mifflin/worker/jim','dunder-mifflin/organisation/company','impact-entity','Contract','Active','2026-09-28',2,false)`.execute(
				transaction,
			)
			await sql`UPDATE hcm.employment SET employment_status='Ended',employment_end_date='2026-09-29',revision=revision+1 WHERE tenant_id=${HCM_TEST_TENANT} AND id='impact-ended'`.execute(
				transaction,
			)
			const subjects = new KyselyWorkforceTimeSubjectsBinder().bind(transaction, HCM_TEST_TENANT)
			for (const date of ['2026-09-28', '2026-09-29'])
				expect(
					(await subjects.page(date, { kind: 'LegalEntity', id: 'impact-entity' })).items,
				).toEqual([{ employmentId: 'impact-ended', employmentRevision: 2 }])
			for (const date of ['2026-09-27', '2026-09-30'])
				expect(
					(await subjects.page(date, { kind: 'Employment', id: 'impact-ended' })).items,
				).toHaveLength(0)
			expect(await port.read('impact-ended', workDate)).toMatchObject({
				state: 'Unavailable',
				reason: 'assignment-unavailable',
			})
		},
	)
})

it('rejects malformed internal continuations and cannot read through foreign or missing tenant context', /** Keyset values are bounded selectors, never authorization or raw SQL identifiers. */ async () => {
	await readWithin(
		/** Exercise parser guards and FORCE RLS on a real restricted transaction. */ async (
			_port,
			transaction,
		) => {
			const binder = new KyselyWorkforceTimeSubjectsBinder(),
				subjects = binder.bind(transaction, HCM_TEST_TENANT)
			expect(
				(await binder.bind(transaction, 'foreign').page(workDate, { kind: 'Tenant' })).items,
			).toHaveLength(0)
			for (const limit of [0, 101, 1.5])
				await expect(
					subjects.page(workDate, { kind: 'Tenant' }, undefined, limit),
				).rejects.toThrow()
			await expect(subjects.page('2026-02-30', { kind: 'Tenant' })).rejects.toThrow()
			await expect(subjects.page(workDate, { kind: 'Tenant' }, '')).rejects.toThrow()
			await expect(
				subjects.page(workDate, { kind: 'Tenant', id: 'hidden' } as WorkforceTimeTarget),
			).rejects.toThrow()
			await expect(
				subjects.page(workDate, { kind: 'constructor' } as unknown as WorkforceTimeTarget),
			).rejects.toThrow()
			await sql`SELECT set_config('hcm.tenant_id','',true)`.execute(transaction)
			expect((await subjects.page(workDate, { kind: 'Tenant' })).items).toHaveLength(0)
			expect(
				/** A pool has no stable transaction-local authority or membership snapshot. */ () =>
					binder.bind(runtime, HCM_TEST_TENANT),
			).toThrow('tenant transaction')
		},
	)
})
