import { afterAll, beforeAll, expect, it } from 'vitest'
import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely'
import { Pool } from 'pg'
import type {
	AssignmentFacts,
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

it('establishes the seeded workforce and its primary reporting lines', /** workforce.foundation@3 content per the data-model seed plan. */ async () => {
	await withPorts(
		/** Read seeded reporting structure. */ async ({ reads }) => {
			const david = await reads.directReports([P + 'assignment/david'], '2026-09-26')
			expect(david.map(/** Report names. */ (edge) => edge.displayName)).toEqual([
				'Michael Scott',
				'Toby Flenderson',
			])
			const michael = await reads.directReports([P + 'assignment/michael'], '2026-09-26')
			expect(michael.map(/** Report names. */ (edge) => edge.displayName)).toEqual([
				'Dwight Schrute',
				'Jim Halpert',
				'Pam Beesly',
			])
			expect(await reads.primaryManager(P + 'assignment/angela', '2026-09-26')).toBeNull()
			expect((await reads.primaryManager(P + 'assignment/jim', '2026-09-26'))?.displayName).toBe(
				'Michael Scott',
			)
			expect(await reads.directReports([P + 'assignment/michael'], '2004-12-31')).toEqual([])
			const [jim] = await reads.currentAssignments(P + 'worker/jim', '2026-09-26')
			expect(jim).toMatchObject({
				jobTitle: 'Sales Representative',
				isPrimary: true,
				fullTimeEquivalent: 1,
			})
		},
	)
	const established = await api.admin.query(
		'SELECT count(*)::int AS count FROM hcm.employment WHERE hire_date IS NOT NULL',
	)
	expect(established.rows[0].count).toBe(8)
})

it('keeps version-1 minimal rows valid while enforcing all-or-none established facts', /** Established-record rule and exclusion constraints. */ async () => {
	const admin = api.admin
	await admin.query('BEGIN')
	try {
		await admin.query(
			`INSERT INTO hcm.employment VALUES ('${HCM_TEST_TENANT}','minimal-employment','${P}worker/jim','${P}organisation/company')`,
		)
		await expect(
			admin.query(
				`INSERT INTO hcm.employment(tenant_id,id,worker_id,organisation_id,hire_date) VALUES ('${HCM_TEST_TENANT}','partial','${P}worker/jim','${P}organisation/company','2020-01-01')`,
			),
		).rejects.toMatchObject({ code: '23514' })
	} finally {
		await admin.query('ROLLBACK')
	}
	await admin.query('BEGIN')
	try {
		await expect(
			admin.query(
				`INSERT INTO hcm.employment(tenant_id,id,worker_id,organisation_id,legal_entity_id,employment_type,employment_status,hire_date,employment_sequence,is_primary_employment) VALUES ('${HCM_TEST_TENANT}','overlap','${P}worker/jim','${P}organisation/company','${P}legal-entity/dmpc','Contract','Active','2020-01-01',2,false)`,
			),
		).rejects.toMatchObject({ code: '23P01' })
	} finally {
		await admin.query('ROLLBACK')
	}
})

it('creates, assigns, supersedes and reports through the facts port', /** Commands validate dated rules and carry reporting lines across a transfer. */ async () => {
	await withPorts(
		/** Hire Ryan, report him to Michael, then promote him from a date. */ async ({
			facts,
			reads,
			trx,
		}) => {
			const ryan = await hire(facts, 'Ryan', 'Howard', 'DM-RYAN')
			const line = await facts.setReportingLine({
				assignmentId: ryan.assignment.id,
				managerAssignmentId: P + 'assignment/michael',
				type: 'Solid',
				isPrimary: true,
				effectiveFrom: '2026-01-05',
				reason: 'New hire',
			})
			expect(line.revision).toBe(1)
			expect(
				(await reads.directReports([P + 'assignment/michael'], '2026-02-01')).map(
					/** Names. */ (edge) => edge.displayName,
				),
			).toContain('Ryan Howard')
			const worker = await sql<{
				engaged: boolean
				first: string
			}>`SELECT is_currently_engaged AS engaged,to_char(first_engagement_start_date,'YYYY-MM-DD') AS first FROM hcm.worker WHERE id=${ryan.worker.id}`.execute(
				trx,
			)
			expect(worker.rows[0]).toEqual({ engaged: true, first: '2026-01-05' })
			await expect(
				facts.supersedeAssignment(ryan.assignment.id, 1, sales('2026-01-05', 'Temp')),
			).rejects.toMatchObject({ code: 'overlapping-effective-period' })
			const moved = await facts.supersedeAssignment(
				ryan.assignment.id,
				1,
				sales('2026-06-01', 'Senior Sales Representative'),
			)
			expect(moved.closed.revision).toBe(2)
			const [current] = await reads.currentAssignments(ryan.worker.id, '2026-06-01')
			expect(current).toMatchObject({
				id: moved.opened.id,
				jobTitle: 'Senior Sales Representative',
			})
			const [before] = await reads.currentAssignments(ryan.worker.id, '2026-05-31')
			expect(before).toMatchObject({ id: ryan.assignment.id, effectiveTo: '2026-05-31' })
			expect((await reads.primaryManager(moved.opened.id, '2026-06-01'))?.displayName).toBe(
				'Michael Scott',
			)
			await expect(
				facts.supersedeAssignment(ryan.assignment.id, 2, sales('2026-07-01')),
			).rejects.toMatchObject({ code: 'invalid-state' })
			await expect(
				facts.setReportingLine({
					assignmentId: P + 'assignment/michael',
					managerAssignmentId: moved.opened.id,
					type: 'Solid',
					isPrimary: true,
					effectiveFrom: '2026-07-01',
					reason: 'Cycle',
				}),
			).rejects.toMatchObject({ code: 'invalid-request' })
			await expect(
				facts.openAssignment(ryan.employment.id, sales('2025-12-31')),
			).rejects.toMatchObject({
				code: 'effective-date-out-of-range',
			})
			const event = await facts.recordWorkerEvent({
				workerId: ryan.worker.id,
				employmentId: ryan.employment.id,
				assignmentId: moved.opened.id,
				eventTypeCode: 'PROMOTED',
				effectiveDate: '2026-06-01',
				reason: 'Promotion',
				previousValueSummary: 'Sales Representative',
				newValueSummary: 'Senior Sales Representative',
				approvedByAccountId: P + 'account/david',
				approvedOn: '2026-05-20',
			})
			expect(event.id).toMatch(/^[0-9a-f-]{36}$/)
			const ended = await facts.applyEmploymentFacts(ryan.employment.id, {
				expectedRevision: 1,
				employmentStatus: 'Ended',
				lastWorkingDate: '2026-08-31',
				employmentEndDate: '2026-08-31',
				employmentEndReasonId: P + 'end-reason/resignation',
				isEligibleForRehire: true,
			})
			expect(ended.revision).toBe(2)
			const after = await sql<{
				engaged: boolean
				last: string
			}>`SELECT is_currently_engaged AS engaged,to_char(latest_engagement_end_date,'YYYY-MM-DD') AS last FROM hcm.worker WHERE id=${ryan.worker.id}`.execute(
				trx,
			)
			expect(after.rows[0]).toEqual({ engaged: false, last: '2026-08-31' })
			await expect(
				facts.applyEmploymentFacts(ryan.employment.id, {
					expectedRevision: 1,
					noticePeriodDays: 60,
				}),
			).rejects.toMatchObject({ code: 'revision-conflict' })
		},
	)
})

it('requires established employment and guards person merge and duplicates', /** record-incomplete, DEC-HCM2-001 candidates and merge limits. */ async () => {
	await withPorts(
		/** Exercise identity rules. */ async ({ facts, reads, trx }) => {
			await sql`INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES(${HCM_TEST_TENANT},'minimal-person','Kevin','Malone','Kevin Malone')`.execute(
				trx,
			)
			await expect(
				facts.openAssignment(P + 'employment/nope', sales('2026-01-05')),
			).rejects.toMatchObject({
				code: 'not-found',
			})
			const ryan = await hire(facts, 'Ryan', 'Howard', 'DM-RYAN')
			const twin = await facts.createPersonWithWorker({
				facts: {
					givenName: 'Rýan',
					middleName: '',
					familyName: 'HOWARD',
					preferredName: '',
					formerName: '',
					birthDate: '1990-02-03',
					genderCode: null,
					maritalStatusCode: null,
					nationalityCountryCode: null,
				},
				workerCode: 'DM-RYAN-2',
				workerTypeId: P + 'worker-type/employee',
			})
			const candidates = await reads.duplicateCandidates({
				givenName: 'ryan',
				familyName: 'howard',
				birthDate: '1990-02-03',
				workEmail: 'Jim.Halpert@DunderMifflin.example',
			})
			const reasons = candidates.map(
				/** Match reasons. */ (item) => [item.displayName, item.reason],
			)
			expect(reasons).toHaveLength(3)
			expect(reasons).toEqual(
				expect.arrayContaining([
					['Jim Halpert', 'work-email'],
					['Rýan HOWARD', 'name-and-birth-date'],
					['Ryan Howard', 'name-and-birth-date'],
				]),
			)
			await expect(facts.mergePerson(ryan.person.id, twin.person.id, 1)).rejects.toMatchObject({
				code: 'merge-requires-correction',
			})
			expect(await facts.mergePerson(twin.person.id, ryan.person.id, 1)).toEqual({
				id: twin.person.id,
				revision: 2,
			})
			expect(
				(
					await reads.duplicateCandidates({
						givenName: 'Ryan',
						familyName: 'Howard',
						birthDate: '1990-02-03',
						workEmail: null,
					})
				).map(/** Survivors only. */ (item) => item.personId),
			).toEqual([ryan.person.id])
			await expect(
				facts.createPersonWithWorker({
					facts: {
						givenName: 'Other',
						middleName: '',
						familyName: 'Ryan',
						preferredName: '',
						formerName: '',
						birthDate: null,
						genderCode: null,
						maritalStatusCode: null,
						nationalityCountryCode: null,
					},
					workerCode: 'DM-RYAN',
					workerTypeId: P + 'worker-type/employee',
				}),
			).rejects.toMatchObject({ code: 'duplicate-code' })
		},
	)
})

it('isolates tenants and limits the runtime role to approved writes', /** RLS, append-only events and column-scoped grants. */ async () => {
	await withPorts(
		/** A foreign tenant sees none of the Dunder Mifflin workforce. */ async ({ reads, trx }) => {
			expect(await reads.directReports([P + 'assignment/michael'], '2026-09-26')).toEqual([])
			expect(await reads.currentAssignments(P + 'worker/jim', '2026-09-26')).toEqual([])
			const visible = await sql<{
				count: number
			}>`SELECT count(*)::int AS count FROM hcm.person`.execute(trx)
			expect(visible.rows[0]?.count).toBe(0)
		},
		'foreign-workforce',
	)
	for (const statement of [
		sql`UPDATE hcm.assignment SET job_title='Rewritten' WHERE id=${P + 'assignment/jim'}`,
		sql`DELETE FROM hcm.worker_event`,
		sql`UPDATE hcm.worker_event SET reason='changed'`,
		sql`UPDATE hcm.person_relationship SET is_statutory_nominee=true`,
		sql`UPDATE hcm.reporting_line SET manager_assignment_id=${P + 'assignment/david'}`,
		sql`DELETE FROM hcm.reporting_line`,
	])
		await expect(
			withPorts(/** Attempt a forbidden write. */ ({ trx }) => statement.execute(trx)),
		).rejects.toMatchObject({ code: '42501' })
})
