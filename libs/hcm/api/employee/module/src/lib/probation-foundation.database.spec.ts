import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { HcmEmployeeModule } from './hcm-api-employee-module'
import { startHcmTestApi, type HcmTestApi } from './employee-test-harness'

let api: HcmTestApi
const ANDY = 'dunder-mifflin/employment/andy'
const REVIEW = 'dunder-mifflin/probation-review/andy-final'

beforeAll(
	/** Start the real module over the migrated and seeded disposable database. */ async () => {
		api = await startHcmTestApi(HcmEmployeeModule)
	},
)
afterAll(
	/** Release the application and connections. */ async () => {
		await api?.close()
	},
)

/** Run statements as the migrator, rolling back and returning the error code of the last. */
async function attempt(...statements: string[]): Promise<string | undefined> {
	await api.admin.query('BEGIN')
	try {
		for (const statement of statements) await api.admin.query(statement)
		await api.admin.query('SET CONSTRAINTS ALL IMMEDIATE')
		return undefined
	} catch (error) {
		return (error as { code?: string }).code
	} finally {
		await api.admin.query('ROLLBACK')
	}
}

/** A new worker with a probation end date. */
function hire(number: string, probationEndDate: string | null) {
	return {
		person: { givenName: 'Kelly', familyName: `Kapoor${number}`, birthDate: '1980-02-05' },
		worker: { workerNumber: number, workerTypeId: 'dunder-mifflin/worker-type/employee' },
		employment: {
			legalEntityId: 'dunder-mifflin/legal-entity/dmpc',
			employmentType: 'Permanent',
			hireDate: '2030-01-06',
			workEmail: `${number.toLowerCase()}@dundermifflin.example`,
			probationEndDate,
		},
		assignment: {
			unitId: 'dunder-mifflin/organisation/scranton',
			departmentId: 'dunder-mifflin/department/sales',
			designationId: 'dunder-mifflin/designation/sales-representative',
			locationId: 'dunder-mifflin/location/scranton',
			jobTitle: 'Customer Service',
			workMode: 'OnSite',
			fullTimeEquivalent: 1,
			standardHoursPerWeek: 40,
		},
		managerWorkerId: 'dunder-mifflin/worker/michael',
		duplicateResolution: { kind: 'none' },
		reason: 'New customer service hire',
	}
}

describe('Probation foundation', /** DEC-HCM2-003 persistence. */ () => {
	it('seeds one Final review 14 days before the end date with Michael as reviewer', /** Seed. */ async () => {
		const { rows } = await api.admin.query(
			`SELECT review_type,to_char(due_date,'YYYY-MM-DD') AS due,primary_reviewer_account_id AS reviewer,owner_account_id AS owner
				FROM hcm.probation_review WHERE employment_id=$1`,
			[ANDY],
		)
		expect(rows).toEqual([
			{
				review_type: 'Final',
				due: '2026-12-17',
				reviewer: 'dunder-mifflin/account/michael',
				owner: 'dunder-mifflin/account/toby',
			},
		])
	})

	it('creates exactly one Final review without a reviewer when a worker is hired into probation', /** REQ-PROBATION-MANAGEMENT-002. */ async () => {
		const number = `DM-K${randomUUID().slice(0, 5).toUpperCase()}`
		const created = await api.send<{ workerId: string }>(
			'toby',
			'POST',
			'employee/records',
			hire(number, '2030-07-06'),
		)
		expect(created.status, JSON.stringify(created.body)).toBe(201)
		const reviews = await api.admin.query(
			`SELECT r.review_type,to_char(r.due_date,'YYYY-MM-DD') AS due,to_char(r.period_start,'YYYY-MM-DD') AS start,
				r.primary_reviewer_account_id AS reviewer,r.status
				FROM hcm.probation_review r JOIN hcm.employment e ON e.tenant_id=r.tenant_id AND e.id=r.employment_id
				WHERE e.worker_id=$1`,
			[created.body.workerId],
		)
		expect(reviews.rows).toEqual([
			{
				review_type: 'Final',
				due: '2030-06-22',
				start: '2030-01-06',
				reviewer: null,
				status: 'Scheduled',
			},
		])
		const audit = await api.admin.query(
			"SELECT count(*)::int AS n FROM hcm.audit_event WHERE action='employee.probation-review-scheduled'",
		)
		expect(audit.rows[0].n).toBeGreaterThanOrEqual(1)
		const plain = `DM-K${randomUUID().slice(0, 5).toUpperCase()}`
		const without = await api.send<{ workerId: string }>(
			'toby',
			'POST',
			'employee/records',
			hire(plain, null),
		)
		expect(without.status).toBe(201)
		const none = await api.admin.query(
			`SELECT count(*)::int AS n FROM hcm.probation_review r JOIN hcm.employment e ON e.tenant_id=r.tenant_id AND e.id=r.employment_id
				WHERE e.worker_id=$1`,
			[without.body.workerId],
		)
		expect(none.rows[0].n).toBe(0)
	})

	it('moves the open Final review when a correction moves the probation end date', /** DEC-HCM2-003 alignment. */ async () => {
		const { rows } = await api.admin.query(
			"SELECT to_char((now() AT TIME ZONE 'America/New_York')::date,'YYYY-MM-DD') AS today",
		)
		const created = await api.send<{ id: string; revision: number }>(
			'toby',
			'POST',
			'employee/changes',
			{
				workerId: 'dunder-mifflin/worker/andy',
				employmentId: ANDY,
				changeType: 'Correction',
				effectiveDate: rows[0].today,
				targets: { probationEndDate: '2027-01-31' },
				reasonCode: 'DATA_ENTRY_ERROR',
				reasonDetail: 'Probation was agreed as seven months',
			},
		)
		expect(created.status, JSON.stringify(created.body)).toBe(201)
		const change = `employee/changes/${encodeURIComponent(created.body.id)}`
		const submitted = await api.send<{ revision: number }>('toby', 'POST', `${change}/submit`, {
			expectedRevision: created.body.revision,
		})
		expect(submitted.status, JSON.stringify(submitted.body)).toBe(200)
		const approved = await api.send<{ status: string }>('david', 'POST', `${change}/decide`, {
			slotCode: 'hr-approver',
			decision: 'Approved',
			reason: 'Contract says seven months',
			expectedRevision: submitted.body.revision,
		})
		expect(approved.body.status, JSON.stringify(approved.body)).toBe('Completed')
		const review = await api.admin.query(
			`SELECT to_char(due_date,'YYYY-MM-DD') AS due,to_char(probation_end_date,'YYYY-MM-DD') AS "end",
				primary_reviewer_account_id AS reviewer FROM hcm.probation_review WHERE id=$1`,
			[REVIEW],
		)
		expect(review.rows[0]).toEqual({
			due: '2027-01-17',
			end: '2027-01-31',
			reviewer: 'dunder-mifflin/account/michael',
		})
	})

	it('keeps one open Final review, one current assessment and one extension per employment', /** Constraints. */ async () => {
		const review = `INSERT INTO hcm.probation_review (tenant_id,id,employment_id,sequence_number,review_type,period_start,period_end,
			probation_end_date,due_date,owner_account_id,schedule_reason,created_by_account_id)
			VALUES ('local-dunder-mifflin','x-final','${ANDY}',2,'Final','2026-07-01','2026-12-31','2026-12-31','2026-12-17',
			'dunder-mifflin/account/toby','Again','dunder-mifflin/account/toby')`
		expect(await attempt(review)).toBe('23505')
		// Only the stored reviewer assesses; reporting lines grant nothing.
		/** An assessment by one account. */
		const assess = (reviewer: string) =>
			`INSERT INTO hcm.probation_assessment (tenant_id,id,review_id,version_number,reviewer_account_id,recommendation,overall_rating,recommendation_reason)
			VALUES ('local-dunder-mifflin','${randomUUID()}','${REVIEW}',1,'${reviewer}','Confirm',4,'Ready')`
		expect(await attempt(assess('dunder-mifflin/account/toby'))).toBe('23514')
		expect(await attempt(assess('dunder-mifflin/account/michael'))).toBeUndefined()
		expect(
			await attempt(
				`INSERT INTO hcm.probation_assessment (tenant_id,id,review_id,version_number,reviewer_account_id,recommendation,overall_rating,recommendation_reason)
				VALUES ('local-dunder-mifflin','x-rating','${REVIEW}',1,'dunder-mifflin/account/michael','Confirm',6,'Ready')`,
			),
		).toBe('23514')
		expect(
			await attempt(
				assess('dunder-mifflin/account/michael'),
				assess('dunder-mifflin/account/michael').replace(",1,'dunder", ",2,'dunder"),
			),
		).toBe('23505')
		/** A decision on the seeded review. */
		const decide = (id: string, outcome: string, extended: string | null) =>
			`INSERT INTO hcm.probation_decision (tenant_id,id,review_id,employment_id,outcome,effective_date,previous_probation_end_date,
			extended_probation_end_date,reason,decided_by_account_id) VALUES ('local-dunder-mifflin','${id}','${REVIEW}','${ANDY}','${outcome}',
			'2026-12-17','2026-12-31',${extended ? `'${extended}'` : 'NULL'},'Decided','dunder-mifflin/account/toby')`
		expect(await attempt(decide('x-extend', 'Extend', null))).toBe('23514')
		expect(await attempt(decide('x-confirm', 'Confirm', '2027-01-31'))).toBe('23514')
		expect(await attempt(decide('x-a', 'Confirm', null), decide('x-b', 'Fail', null))).toBe('23505')
	})

	it('refuses runtime deletes and edits of decided history', /** Append-only grants. */ async () => {
		const runtime = await api.admin.query(
			`SELECT table_name,privilege_type FROM information_schema.role_table_grants
				WHERE grantee='hcm_runtime' AND table_name IN ('probation_review','probation_assessment','probation_decision')
				ORDER BY table_name,privilege_type`,
		)
		const grants = runtime.rows.map(
			/** Grant. */ (row: { table_name: string; privilege_type: string }) =>
				`${row.table_name}:${row.privilege_type}`,
		)
		expect(grants).toEqual([
			'probation_assessment:INSERT',
			'probation_assessment:SELECT',
			'probation_decision:INSERT',
			'probation_decision:SELECT',
			'probation_review:INSERT',
			'probation_review:SELECT',
		])
	})
})
