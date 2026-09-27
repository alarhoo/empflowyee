import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type {
	DuplicateCandidateDto,
	EmergencyInfoDto,
	RecordOptionPage,
	WorkerEventPage,
	WorkerRecordDto,
	WorkerRecordPage,
} from '@empflowyee/hcm-employee-contract'
import { HcmEmployeeModule } from './hcm-api-employee-module'
import { startHcmTestApi, type HcmTestApi } from './employee-test-harness'

let api: HcmTestApi
const base = 'employee/records'
const JIM = 'dunder-mifflin/worker/jim'
const MICHAEL = 'dunder-mifflin/worker/michael'
type Reply = WorkerRecordDto & { code?: string; fieldErrors?: { field: string; code: string }[] }

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

/** An encoded path segment. */
function seg(id: string): string {
	return encodeURIComponent(id)
}

/** Read one record as Toby. */
async function record(id: string): Promise<WorkerRecordDto> {
	return (await api.send<WorkerRecordDto>('toby', 'GET', `${base}/${seg(id)}`)).body
}

/** A complete new worker, hired on a date. */
function newWorker(number: string, overrides: Record<string, unknown> = {}) {
	return {
		person: {
			givenName: 'Ryan',
			familyName: 'Howard',
			birthDate: '1979-05-05',
			genderCode: 'MALE',
			maritalStatusCode: 'SINGLE',
			nationalityCountryCode: 'US',
		},
		worker: { workerNumber: number, workerTypeId: 'dunder-mifflin/worker-type/employee' },
		employment: {
			legalEntityId: 'dunder-mifflin/legal-entity/dmpc',
			employmentType: 'Permanent',
			hireDate: '2030-01-06',
			workEmail: `${number.toLowerCase()}@dundermifflin.example`,
		},
		assignment: {
			unitId: 'dunder-mifflin/organisation/scranton',
			departmentId: 'dunder-mifflin/department/sales',
			designationId: 'dunder-mifflin/designation/sales-representative',
			locationId: 'dunder-mifflin/location/scranton',
			jobTitle: 'Temp',
			workMode: 'OnSite',
			fullTimeEquivalent: 1,
			standardHoursPerWeek: 40,
		},
		managerWorkerId: MICHAEL,
		duplicateResolution: { kind: 'none' },
		reason: 'New temp for Scranton',
		...overrides,
	}
}

describe('Employee Records', /** Employee Records FDD. */ () => {
	it('finds any worker by name, number or work email, with filters', /** REQ-EMPLOYEE-RECORDS-001. */ async () => {
		const all = await api.send<WorkerRecordPage>('toby', 'GET', base)
		expect(all.status).toBe(200)
		expect(all.body.items.length).toBeGreaterThanOrEqual(8)
		expect(all.body.items[0]).toMatchObject({ recordState: 'Complete', employmentStatus: 'Active' })
		for (const q of ['halp', 'DM-JIM', 'jim.halpert'])
			expect(
				(await api.send<WorkerRecordPage>('toby', 'GET', `${base}?q=${q}`)).body.items.map(
					/** Worker. */ (item) => item.workerId,
				),
			).toEqual([JIM])
		const byNumber = await api.send<WorkerRecordPage>(
			'toby',
			'GET',
			`${base}?sort=workerNumber:asc&limit=2`,
		)
		expect(byNumber.body.items.map(/** Number. */ (item) => item.workerNumber)).toEqual([
			'DM-ANGELA',
			'DM-DAVID',
		])
		const accounting = await api.send<WorkerRecordPage>(
			'toby',
			'GET',
			`${base}?departmentId=${seg('dunder-mifflin/department/accounting')}`,
		)
		expect(accounting.body.items.map(/** Name. */ (item) => item.displayName).sort()).toEqual([
			'Angela Martin',
			'Oscar Martinez',
		])
		for (const persona of ['jim', 'michael', 'david'])
			expect((await api.send(persona, 'GET', base)).status).toBe(403)
		expect((await api.send('toby', 'GET', `${base}?status=Nope`)).status).toBe(400)
	})

	it('shows the complete record through the HR allowlist, without emergency values', /** REQ-EMPLOYEE-RECORDS-002. */ async () => {
		const jim = await record(JIM)
		expect(jim).toMatchObject({
			workerId: JIM,
			workerNumber: 'DM-JIM',
			recordState: 'Complete',
			givenName: 'Jim',
			familyName: 'Halpert',
			mergedFromWorkerId: null,
		})
		expect(jim.employments[0]).toMatchObject({ employmentStatus: 'Active', primary: true })
		expect(jim.assignments[0]).toMatchObject({ position: { code: 'SCR-SALES-REP' } })
		expect(jim.reporting[0]).toMatchObject({ managerName: 'Michael Scott', primary: true })
		expect(JSON.stringify(jim)).not.toContain('bloodGroup')
		expect((await record(MICHAEL)).directReportCount).toBeGreaterThan(0)
		const events = await api.send<WorkerEventPage>('toby', 'GET', `${base}/${seg(JIM)}/events`)
		expect(events.status).toBe(200)
		expect((await api.send('toby', 'GET', `${base}/nope`)).status).toBe(404)
	})

	it('corrects personal facts with a reason, audited by field name', /** REQ-EMPLOYEE-RECORDS-003. */ async () => {
		const jim = await record(JIM)
		const corrected = await api.send<Reply>('toby', 'PUT', `${base}/${seg(JIM)}/person`, {
			givenName: 'James',
			familyName: 'Halpert',
			birthDate: '1978-10-01',
			expectedRevision: jim.personRevision,
			reason: 'Legal name on passport',
		})
		expect(corrected.status).toBe(200)
		expect(corrected.body).toMatchObject({ givenName: 'James', birthDate: '1978-10-01' })
		expect(corrected.body.personRevision).toBe(jim.personRevision + 1)
		const stale = await api.send<Reply>('toby', 'PUT', `${base}/${seg(JIM)}/person`, {
			givenName: 'Jim',
			familyName: 'Halpert',
			expectedRevision: jim.personRevision,
			reason: 'Again',
		})
		expect([stale.status, stale.body.code]).toEqual([409, 'revision-conflict'])
		const audit = await api.admin.query<{ summary: { changedFields: string[]; reason: string } }>(
			"SELECT safe_summary AS summary FROM hcm.audit_event WHERE action='employee.record-person-corrected' ORDER BY occurred_at DESC LIMIT 1",
		)
		expect(audit.rows[0]?.summary.changedFields).toEqual(['givenName', 'birthDate'])
		expect(JSON.stringify(audit.rows[0])).not.toContain('James')
		// Employment and assignment facts have no endpoint here.
		expect(
			(await api.send('toby', 'PUT', `${base}/${seg(JIM)}/employments/x`, { reason: 'x' })).status,
		).toBe(400)
		// Addresses are effective-dated: a correction closes the old address and adds the successor.
		const added = await api.send<Reply>('toby', 'POST', `${base}/${seg(JIM)}/addresses`, {
			type: 'Permanent',
			line1: '1725 Slough Avenue',
			city: 'Scranton',
			countryCode: 'US',
			primary: true,
			effectiveFrom: '2020-01-01',
			reason: 'Home address on file',
		})
		expect(added.status).toBe(201)
		const address = added.body.addresses?.find(/** Current. */ (item) => item.effectiveTo === null)
		const moved = await api.send<Reply>(
			'toby',
			'PUT',
			`${base}/${seg(JIM)}/addresses/${seg(address?.id ?? '')}`,
			{
				type: 'Permanent',
				line1: '12 Maple Street',
				city: 'Scranton',
				countryCode: 'US',
				primary: true,
				effectiveFrom: '2024-06-01',
				expectedRevision: address?.revision,
				reason: 'Moved house',
			},
		)
		expect(moved.status).toBe(200)
		expect(
			moved.body.addresses?.map(/** Range. */ (item) => [item.line1, item.effectiveTo]),
		).toEqual([
			['12 Maple Street', null],
			['1725 Slough Avenue', '2024-05-31'],
		])
		const contact = await api.send<Reply>('toby', 'POST', `${base}/${seg(JIM)}/contact-points`, {
			type: 'MobilePhone',
			value: '+1 570 555 0100',
			reason: 'Given at onboarding',
		})
		expect(
			contact.body.contactPoints?.some(/** Added. */ (item) => item.value === '+1 570 555 0100'),
		).toBe(true)
		const invalid = await api.send<Reply>('toby', 'POST', `${base}/${seg(JIM)}/contact-points`, {
			type: 'MobilePhone',
			value: 'not a phone',
			reason: 'x',
		})
		expect(invalid.body.fieldErrors).toEqual([{ field: 'value', code: 'format' }])
		const missingReason = await api.send<Reply>(
			'toby',
			'POST',
			`${base}/${seg(JIM)}/contact-points`,
			{
				type: 'MobilePhone',
				value: '+1 570 555 0101',
			},
		)
		expect(missingReason.body.fieldErrors).toEqual([{ field: 'reason', code: 'required' }])
	})

	it('reveals emergency information only with the permission and a purpose', /** REQ-EMPLOYEE-RECORDS-006. */ async () => {
		const jim = await record(JIM)
		await api.send<Reply>('toby', 'POST', `${base}/${seg(JIM)}/relationships`, {
			relationshipType: 'SPOUSE',
			fullName: 'Pam Beesly',
			contactNumber: '+1 570 555 0199',
			dependent: false,
			emergencyContact: true,
			emergencyPriority: 1,
			reason: 'Emergency contact form',
		})
		const listed = await record(JIM)
		expect(
			listed.relationships?.find(/** Pam. */ (item) => item.fullName === 'Pam Beesly')
				?.contactNumber ?? null,
		).toBeNull()
		expect(listed.personRevision).toBe(jim.personRevision)
		const reveal = await api.send<EmergencyInfoDto>(
			'toby',
			'POST',
			`${base}/${seg(JIM)}/emergency-reveal`,
			{
				purpose: 'Injury at the warehouse',
			},
		)
		expect(reveal.status).toBe(200)
		expect(reveal.body.emergencyContacts[0]).toMatchObject({
			fullName: 'Pam Beesly',
			contactNumber: '+1 570 555 0199',
		})
		const audit = await api.admin.query<{
			category: string
			summary: { reason: string }
			target: string
		}>(
			"SELECT category,safe_summary AS summary,target_id AS target FROM hcm.audit_event WHERE action='employee.emergency-revealed' ORDER BY occurred_at DESC LIMIT 1",
		)
		expect(audit.rows[0]).toMatchObject({
			category: 'sensitive-access',
			target: JIM,
			summary: { reason: 'Injury at the warehouse' },
		})
		expect(JSON.stringify(audit.rows[0])).not.toContain('555')
		expect(
			(await api.send('toby', 'POST', `${base}/${seg(JIM)}/emergency-reveal`, {})).status,
		).toBe(400)
		await api.admin.query(
			"DELETE FROM hcm.role_permission WHERE role_id='hr-specialist' AND permission_code='hcm.employee.records.emergency.read'",
		)
		try {
			expect(
				(await api.send('toby', 'POST', `${base}/${seg(JIM)}/emergency-reveal`, { purpose: 'x' }))
					.status,
			).toBe(403)
		} finally {
			await api.admin.query(
				"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES ('local-dunder-mifflin','hr-specialist','hcm.employee.records.emergency.read')",
			)
		}
	})

	it('creates a pending worker with employment, assignment, manager line and Hired event together', /** REQ-EMPLOYEE-RECORDS-004. */ async () => {
		const number = `DM-${randomUUID().slice(0, 6).toUpperCase()}`
		const created = await api.send<Reply>('toby', 'POST', base, newWorker(number))
		expect(created.status).toBe(201)
		expect(created.body).toMatchObject({
			workerNumber: number,
			displayName: 'Ryan Howard',
			recordState: 'Complete',
			employments: [{ employmentStatus: 'Pending', hireDate: '2030-01-06' }],
			assignments: [{ jobTitle: 'Temp', effectiveFrom: '2030-01-06' }],
			reporting: [{ managerName: 'Michael Scott', primary: true }],
		})
		const events = await api.send<WorkerEventPage>(
			'toby',
			'GET',
			`${base}/${seg(created.body.workerId)}/events`,
		)
		expect(events.body.items.map(/** Code. */ (item) => item.eventTypeCode)).toEqual(['HIRED'])
		// Worker numbers are unique and nothing is kept from a failed attempt.
		const again = await api.send<Reply>(
			'toby',
			'POST',
			base,
			newWorker(number, {
				person: { givenName: 'Other', familyName: 'Person' },
				employment: {
					legalEntityId: 'dunder-mifflin/legal-entity/dmpc',
					employmentType: 'Permanent',
					hireDate: '2030-01-06',
					workEmail: 'other.person@dundermifflin.example',
				},
			}),
		)
		expect([again.status, again.body.code]).toEqual([409, 'duplicate-code'])
		const people = await api.admin.query("SELECT 1 FROM hcm.person WHERE given_name='Other'")
		expect(people.rowCount).toBe(0)
		// An unknown manager fails the whole creation.
		const orphan = await api.send<Reply>(
			'toby',
			'POST',
			base,
			newWorker(`DM-${randomUUID().slice(0, 6).toUpperCase()}`, {
				person: { givenName: 'Kelly', familyName: 'Kapoor' },
				employment: {
					legalEntityId: 'dunder-mifflin/legal-entity/dmpc',
					employmentType: 'Permanent',
					hireDate: '2030-01-06',
				},
				managerWorkerId: 'nope',
			}),
		)
		expect(orphan.status).toBe(400)
		expect(
			(await api.admin.query("SELECT 1 FROM hcm.person WHERE given_name='Kelly'")).rowCount,
		).toBe(0)
	})

	it('blocks creation on duplicate candidates until resolved, and audits the resolution', /** REQ-EMPLOYEE-RECORDS-005. */ async () => {
		const check = await api.send<{ candidates: DuplicateCandidateDto[] }>(
			'toby',
			'POST',
			`${base}/duplicate-check`,
			{ givenName: 'RYAN', familyName: 'howard', birthDate: '1979-05-05' },
		)
		expect(check.body.candidates).toHaveLength(1)
		expect(check.body.candidates[0]?.reason).toBe('name-and-birth-date')
		// Without both birth dates, a name alone is not a candidate.
		const nameOnly = await api.send<{ candidates: DuplicateCandidateDto[] }>(
			'toby',
			'POST',
			`${base}/duplicate-check`,
			{ givenName: 'Ryan', familyName: 'Howard' },
		)
		expect(nameOnly.body.candidates).toEqual([])
		const number = `DM-${randomUUID().slice(0, 6).toUpperCase()}`
		const blocked = await api.send<Reply>('toby', 'POST', base, newWorker(number))
		expect([blocked.status, blocked.body.code]).toEqual([409, 'duplicate-candidate'])
		const resolved = await api.send<Reply>(
			'toby',
			'POST',
			base,
			newWorker(number, {
				duplicateResolution: {
					kind: 'create-new',
					candidatePersonIds: check.body.candidates.map(/** Id. */ (item) => item.personId),
					reason: 'Different person with the same name',
				},
			}),
		)
		expect(resolved.status).toBe(201)
		const audit = await api.admin.query<{ summary: { reason: string } }>(
			"SELECT safe_summary AS summary FROM hcm.audit_event WHERE action='employee.duplicate-resolved' ORDER BY occurred_at DESC LIMIT 1",
		)
		expect(audit.rows[0]?.summary.reason).toBe('Different person with the same name')
	})

	it('merges a duplicate without an established employment only', /** REQ-EMPLOYEE-RECORDS-010. */ async () => {
		const ryans = (await api.send<WorkerRecordPage>('toby', 'GET', `${base}?q=Ryan`)).body.items
		expect(ryans).toHaveLength(2)
		const [survivor, duplicate] = ryans as [(typeof ryans)[0], (typeof ryans)[0]]
		const s = await record(survivor.workerId)
		const d = await record(duplicate.workerId)
		const refused = await api.send<Reply>(
			'toby',
			'POST',
			`${base}/${seg(duplicate.workerId)}/merge`,
			{
				survivorWorkerId: survivor.workerId,
				expectedRevision: d.personRevision,
				survivorExpectedRevision: s.personRevision,
				reason: 'Duplicate record',
			},
		)
		expect([refused.status, refused.body.code]).toEqual([409, 'merge-requires-correction'])
		// A person entered without an employment can be merged; the survivor answers for it.
		await api.admin.query(
			"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name,search_text) VALUES ('local-dunder-mifflin','qa/person/jim-duplicate','Jim','Halpert','Jim Halpert','jim halpert')",
		)
		await api.admin.query(
			"INSERT INTO hcm.worker(tenant_id,id,person_id,worker_code) VALUES ('local-dunder-mifflin','qa/worker/jim-duplicate','qa/person/jim-duplicate','DM-JIM-DUP')",
		)
		const spine = await record('qa/worker/jim-duplicate')
		expect(spine.recordState).toBe('Incomplete')
		const merged = await api.send<Reply>(
			'toby',
			'POST',
			`${base}/${seg('qa/worker/jim-duplicate')}/merge`,
			{
				survivorWorkerId: JIM,
				expectedRevision: spine.personRevision,
				survivorExpectedRevision: (await record(JIM)).personRevision,
				reason: 'Duplicate record',
			},
		)
		expect(merged.status).toBe(200)
		expect(merged.body.workerId).toBe(JIM)
		expect((await record('qa/worker/jim-duplicate')).mergedFromWorkerId).toBe(
			'qa/worker/jim-duplicate',
		)
		expect(
			(await api.send<WorkerRecordPage>('toby', 'GET', `${base}?q=DM-JIM-DUP`)).body.items,
		).toEqual([])
		expect(
			(await api.send<RecordOptionPage>('toby', 'GET', `${base}/options/worker-types`)).body.items,
		).toHaveLength(3)
	})
})
