import { afterAll, beforeAll, expect, it } from 'vitest'
import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely'
import { Pool } from 'pg'
import type {
	AssignmentFacts,
	WorkforceChangeContextPort,
	WorkforceFactsPort,
	WorkforceReadPort,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import { KyselyWorkforcePortBinder } from '@empflowyee/hcm-api-workforce-foundation-infrastructure'
import { HcmWorkforceFoundationModule } from './hcm-api-workforce-foundation-module'
import { HCM_TEST_TENANT, startHcmTestApi, type HcmTestApi } from './hcm2-test-harness'

let api: HcmTestApi
let runtime: Kysely<unknown>
const P = 'dunder-mifflin/'
const actor = { tenantId: HCM_TEST_TENANT, accountId: P + 'account/toby' }

/** Rolled back on purpose so each case starts from the seeded workforce. */
class Rollback extends Error {}

/**
 * Run ports as the restricted runtime role inside one tenant transaction. The transaction is
 * rolled back unless `commit` is set, so cases never leak rows into each other.
 */
async function withPorts<T>(
	work: (ports: {
		facts: WorkforceFactsPort
		reads: WorkforceReadPort
		changes: WorkforceChangeContextPort
		trx: Transaction<unknown>
	}) => Promise<T>,
	tenant = HCM_TEST_TENANT,
): Promise<T> {
	let result: T | undefined
	try {
		await runtime.transaction().execute(
			/** Install tenant context, then run the case. */ async (trx) => {
				await sql`SELECT set_config('hcm.tenant_id', ${tenant}, true)`.execute(trx)
				result = await work({
					...new KyselyWorkforcePortBinder().bind(trx, { ...actor, tenantId: tenant }),
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

/** A valid Scranton sales assignment starting on a date. */
function sales(effectiveFrom: string, title = 'Sales Representative'): AssignmentFacts {
	return {
		organisationId: P + 'organisation/scranton',
		locationId: P + 'location/scranton',
		departmentId: P + 'department/sales',
		designationId: P + 'designation/sales-representative',
		jobTitle: title,
		workMode: 'OnSite',
		fullTimeEquivalent: 1,
		standardHoursPerWeek: 40,
		isPrimary: true,
		isBillable: false,
		costCenterCode: '',
		effectiveFrom,
		changeNote: '',
	}
}

/** Create an established hire for the command cases. */
async function hire(facts: WorkforceFactsPort, given: string, family: string, code: string) {
	const created = await facts.createPersonWithWorker({
		facts: {
			givenName: given,
			middleName: '',
			familyName: family,
			preferredName: '',
			formerName: '',
			birthDate: '1990-02-03',
			genderCode: null,
			maritalStatusCode: null,
			nationalityCountryCode: 'US',
		},
		workerCode: code,
		workerTypeId: P + 'worker-type/employee',
	})
	const employment = await facts.createEmployment({
		workerId: created.worker.id,
		legalEntityId: P + 'legal-entity/dmpc',
		employmentType: 'Permanent',
		employmentStatus: 'Active',
		hireDate: '2026-01-05',
		isPrimary: true,
		workEmail: `${given}.${family}@dundermifflin.example`.toLowerCase(),
		continuousServiceStartDate: null,
		probationEndDate: '2026-07-05',
		probationStatus: 'InProgress',
		noticePeriodDays: 30,
	})
	const assignment = await facts.openAssignment(employment.id, sales('2026-01-05'))
	return { ...created, employment, assignment }
}

beforeAll(
	/** Migrate and seed a disposable database, then open a runtime-role pool. */ async () => {
		api = await startHcmTestApi(HcmWorkforceFoundationModule)
		const url = process.env['HCM_TEST_RUNTIME']
		if (!url) throw new Error('Disposable database required')
		runtime = new Kysely({
			dialect: new PostgresDialect({ pool: new Pool({ connectionString: url, max: 2 }) }),
		})
	},
)
afterAll(
	/** Release pools and the application. */ async () => {
		await runtime?.destroy()
		await api?.close()
	},
)

const TOBY = P + 'account/toby'
const DAVID = P + 'account/david'

/** Run statements as runtime in one rolled-back transaction and return the SQLSTATE, or 'ok'. */
async function sqlState(statements: ReturnType<typeof sql>[]): Promise<string> {
	try {
		await runtime.transaction().execute(
			/** Tenant context, then the statements. */ async (trx) => {
				await sql`SELECT set_config('hcm.tenant_id', ${HCM_TEST_TENANT}, true)`.execute(trx)
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

/** A draft change request on Jim's employment for a date. */
const draft = (id: string, date = '2026-10-01', type = 'Transfer') =>
	sql`INSERT INTO hcm.workforce_change_request(tenant_id,id,worker_id,employment_id,assignment_id,change_type,effective_date,reason_code,requested_by_account_id,idempotency_key)
		VALUES (${HCM_TEST_TENANT},${id},${P + 'worker/jim'},${P + 'employment/jim'},${P + 'assignment/jim'},${type},${date}::date,'BUSINESS_NEED',${TOBY},gen_random_uuid())`

it('reads the facts a change is based on, with revisions, position and manager', /** Employment Changes TDD#READ. */ async () => {
	const context = await withPorts(
		/** Jim on a date. */ ({ changes }) => changes.context(P + 'worker/jim', '2026-09-26'),
	)
	expect(context).toMatchObject({
		workerNumber: 'DM-JIM',
		workerType: { id: P + 'worker-type/employee' },
		employments: [
			{
				employmentId: P + 'employment/jim',
				revision: expect.any(Number),
				established: true,
				employmentStatus: 'Active',
				employmentType: 'Permanent',
				legalEntity: { id: P + 'legal-entity/dmpc' },
			},
		],
		assignments: [
			{
				assignmentId: P + 'assignment/jim',
				effectiveFrom: '2005-01-01',
				position: { id: P + 'position/SCR-SALES-REP' },
				manager: { id: P + 'worker/michael', assignmentId: P + 'assignment/michael' },
				fullTimeEquivalent: 1,
			},
		],
	})
	const missing = await withPorts(
		/** Unknown and foreign-tenant workers read as absent. */ async ({ changes }) =>
			changes.context('unknown', '2026-09-26'),
	)
	expect(missing).toBeUndefined()
	expect(
		await withPorts(
			/** Another tenant sees nothing. */ ({ changes }) =>
				changes.context(P + 'worker/jim', '2026-09-26'),
			'local-other',
		),
	).toBeUndefined()
})

it('carries a position, employment type, worker type and ended manager line through the facts port', /** Employment Changes TDD#ACTION. */ async () => {
	const result = await withPorts(
		/** Apply the typed commands a change executes. */ async ({ facts, changes }) => {
			const moved = await facts.supersedeAssignment(P + 'assignment/jim', 1, {
				...sales('2026-10-01', 'Senior Sales Representative'),
				positionId: P + 'position/SCR-SALES-REP',
			})
			const ended = await facts.endPrimaryReportingLine(moved.opened.id, '2026-11-01')
			const context = await changes.context(P + 'worker/jim', '2026-11-01')
			const employment = await changes.lockEmployment(P + 'employment/jim')
			const typed = await facts.applyEmploymentFacts(P + 'employment/jim', {
				expectedRevision: employment?.revision ?? 0,
				employmentType: 'FixedTerm',
				continuousServiceStartDate: '2004-12-01',
			})
			const worker = await facts.setWorkerType(P + 'worker/jim', P + 'worker-type/contractor')
			const event = await facts.recordWorkerEvent({
				workerId: P + 'worker/jim',
				employmentId: P + 'employment/jim',
				assignmentId: moved.opened.id,
				eventTypeCode: 'SUSPENDED',
				effectiveDate: '2026-11-01',
				reason: 'Investigation',
				previousValueSummary: 'Active',
				newValueSummary: 'Suspended',
				approvedByAccountId: DAVID,
				approvedOn: '2026-09-26',
			})
			const after = await changes.context(P + 'worker/jim', '2026-11-01')
			return { moved, ended, context, typed, worker, event, after }
		},
	)
	expect(result.ended).toMatchObject({ revision: 2 })
	expect(result.context?.assignments).toEqual([
		expect.objectContaining({
			assignmentId: result.moved.opened.id,
			jobTitle: 'Senior Sales Representative',
			position: expect.objectContaining({ id: P + 'position/SCR-SALES-REP' }),
			manager: null,
		}),
	])
	expect(result.after?.employments[0]).toMatchObject({
		employmentType: 'FixedTerm',
		continuousServiceStartDate: '2004-12-01',
	})
	expect(result.after?.workerType?.id).toBe(P + 'worker-type/contractor')
	expect(result.event.id).toEqual(expect.any(String))
	await expect(
		withPorts(
			/** A position must exist. */ ({ facts }) =>
				facts.supersedeAssignment(P + 'assignment/jim', 1, {
					...sales('2026-10-01'),
					positionId: 'unknown',
				}),
		),
	).rejects.toMatchObject({ fieldErrors: [{ field: 'positionId', code: 'unknown' }] })
})

it('establishes an incomplete assignment and keeps it in history', /** REQ-EMPLOYMENT-CHANGES-004. */ async () => {
	const result = await withPorts(
		/** An incomplete row on a hired employment. */ async ({ facts, changes, trx }) => {
			const hired = await hire(facts, 'Creed', 'Bratton', 'DM-CREED')
			const spine = 'incomplete-assignment'
			const incomplete = sql`INSERT INTO hcm.assignment(tenant_id,id,employment_id,organisation_id,location_id,job_title,created_by_account_id,updated_by_account_id)
				VALUES (${HCM_TEST_TENANT},${spine},${hired.employment.id},${P + 'organisation/scranton'},${P + 'location/scranton'},'Quality',${TOBY},${TOBY})`
			await incomplete.execute(trx)
			const before = await changes.context(hired.worker.id, '2026-09-26')
			const established = await facts.establishAssignment(spine, 1, {
				...sales('2026-09-01', 'Quality Assurance'),
				isPrimary: false,
			})
			const [closed] = (
				await sql<{
					effectiveTo: string
					supersededBy: string
				}>`SELECT to_char(effective_to,'YYYY-MM-DD') AS "effectiveTo",superseded_by_id AS "supersededBy" FROM hcm.assignment WHERE tenant_id=${HCM_TEST_TENANT} AND id=${spine}`.execute(
					trx,
				)
			).rows
			return { before, established, closed }
		},
	)
	expect(result.before?.assignments).toContainEqual(
		expect.objectContaining({ assignmentId: 'incomplete-assignment', effectiveFrom: null }),
	)
	expect(result.closed).toEqual({
		effectiveTo: '2026-08-31',
		supersededBy: result.established.opened.id,
	})
	await expect(
		withPorts(
			/** An established row is superseded, not established. */ ({ facts }) =>
				facts.establishAssignment(P + 'assignment/jim', 1, sales('2026-10-01')),
		),
	).rejects.toMatchObject({ code: 'invalid-state' })
})

it('keeps one open request per employment and date, and requests typed by subject', /** Business rule 17. */ async () => {
	expect(await sqlState([draft('c1')])).toBe('ok')
	expect(await sqlState([draft('c1'), draft('c2')])).toBe('23505')
	expect(await sqlState([draft('c1'), draft('c2', '2026-10-02')])).toBe('ok')
	expect(
		await sqlState([
			draft('c1'),
			sql`UPDATE hcm.workforce_change_request SET status='Cancelled',cancelled_at=now(),cancel_reason='Duplicate' WHERE tenant_id=${HCM_TEST_TENANT} AND id='c1'`,
			draft('c2'),
		]),
	).toBe('ok')
	// A rehire starts a new employment, so it names none; every other type names one.
	expect(
		await sqlState([
			sql`INSERT INTO hcm.workforce_change_request(tenant_id,id,worker_id,employment_id,change_type,effective_date,reason_code,requested_by_account_id,idempotency_key)
				VALUES (${HCM_TEST_TENANT},'c3',${P + 'worker/jim'},${P + 'employment/jim'},'Rehire','2026-10-01','RETURNING',${TOBY},gen_random_uuid())`,
		]),
	).toBe('23514')
	// Submission snapshots the policy; a pending request without one is refused.
	expect(
		await sqlState([
			draft('c1'),
			sql`UPDATE hcm.workforce_change_request SET status='PendingApproval',submitted_at=now() WHERE tenant_id=${HCM_TEST_TENANT} AND id='c1'`,
		]),
	).toBe('23514')
	expect(
		await sqlState([
			draft('c1'),
			sql`UPDATE hcm.workforce_change_request SET cleared_fields=ARRAY['legalEntityId'] WHERE tenant_id=${HCM_TEST_TENANT} AND id='c1'`,
		]),
	).toBe('23514')
})

it('keeps approvals independent and approvals and execution steps append-only', /** DEC-HCM2-002. */ async () => {
	const submitted = [
		draft('c1'),
		sql`UPDATE hcm.workforce_change_request SET status='PendingApproval',submitted_at=now(),approval_policy_code='employment-change',approval_policy_version=1 WHERE tenant_id=${HCM_TEST_TENANT} AND id='c1'`,
	]
	/** One decision on the request. */
	const decide = (id: string, by: string, slot = 'hr-approver') =>
		sql`INSERT INTO hcm.workforce_change_approval(tenant_id,id,request_id,approval_slot_code,decided_by_account_id,decision,authority_code,reason)
			VALUES (${HCM_TEST_TENANT},${id},'c1',${slot},${by},'Approved','hcm.employee.changes.approve','Budget confirmed')`
	const immediate = sql`SET CONSTRAINTS ALL IMMEDIATE`
	expect(await sqlState([...submitted, immediate, decide('a1', DAVID)])).toBe('ok')
	expect(await sqlState([...submitted, immediate, decide('a1', TOBY)])).toBe('23514')
	expect(
		await sqlState([...submitted, immediate, decide('a1', DAVID), decide('a2', DAVID, 'second')]),
	).toBe('23505')
	expect(
		await sqlState([
			...submitted,
			immediate,
			decide('a1', DAVID),
			sql`UPDATE hcm.workforce_change_approval SET reason='Changed' WHERE tenant_id=${HCM_TEST_TENANT} AND id='a1'`,
		]),
	).toBe('42501')
	const step = sql`INSERT INTO hcm.workforce_change_execution_step(tenant_id,id,request_id,step_code,sequence_number,status,idempotency_key,input_hash,completed_at,result_entity_type,result_entity_id)
		VALUES (${HCM_TEST_TENANT},'s1','c1','supersede-assignment',1,'Succeeded','c1:1:1',repeat('a',64),now(),'assignment',${P + 'assignment/jim'})`
	expect(await sqlState([...submitted, step])).toBe('ok')
	expect(
		await sqlState([
			...submitted,
			step,
			sql`UPDATE hcm.workforce_change_execution_step SET status='Failed' WHERE tenant_id=${HCM_TEST_TENANT} AND id='s1'`,
		]),
	).toBe('42501')
	expect(
		await sqlState([
			...submitted,
			sql`DELETE FROM hcm.workforce_change_request WHERE tenant_id=${HCM_TEST_TENANT} AND id='c1'`,
		]),
	).toBe('42501')
})

it('records the event types of the new change types', /** workforce.foundation@4. */ async () => {
	const codes = await withPorts(
		/** Seeded event type codes. */ async ({ trx }) =>
			(
				await sql<{
					code: string
				}>`SELECT code FROM hcm.worker_event_type WHERE tenant_id=${HCM_TEST_TENANT} AND sort_order BETWEEN 10 AND 15 ORDER BY sort_order`.execute(
					trx,
				)
			).rows.map(/** Code. */ (row) => row.code),
	)
	expect(codes).toEqual([
		'LOCATION_CHANGED',
		'MANAGER_CHANGED',
		'HOURS_CHANGED',
		'EMPLOYMENT_TYPE_CHANGED',
		'SUSPENDED',
		'RETURNED_TO_WORK',
	])
})
