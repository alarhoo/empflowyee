import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type {
	ImportRowPage,
	ImportRunDto,
	ImportRunPage,
	ImportTemplateDetailDto,
	ImportTemplatePage,
} from '@empflowyee/hcm-employee-contract'
import { HcmEmployeeModule } from './hcm-api-employee-module'
import { startHcmTestApi, type HcmTestApi } from './employee-test-harness'

let api: HcmTestApi
const base = 'employee/import'
const TEMPLATE = 'dunder-mifflin/import-template/new-hires-1'
const HEADER =
	'First name,Last name,Worker number,Work email,Legal entity,Hire date,Unit,Department,Designation,Location,Manager'
type Failure = { code?: string; fieldErrors?: { field: string; code: string }[] }

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

/** Upload a CSV for a template as Toby. */
function upload(
	csv: string,
	intendedAction = 'Create',
	templateId = TEMPLATE,
	name = 'hires.csv',
	type = 'text/csv',
) {
	return api.upload<ImportRunDto & Failure>(
		'toby',
		`${base}/runs`,
		{ templateId, intendedAction },
		{ name, type, bytes: Buffer.from(csv, 'utf8') },
	)
}

/** A command on a run. */
function act(id: string, op: string, body: Record<string, unknown>, persona = 'toby') {
	return api.send<ImportRunDto & Failure>(persona, 'POST', `${base}/runs/${seg(id)}/${op}`, body)
}

/** Resolve one row of a run. */
function resolve(runId: string, rowId: string, body: Record<string, unknown>) {
	return api.send<Failure>(
		'toby',
		'POST',
		`${base}/runs/${seg(runId)}/rows/${seg(rowId)}/resolve`,
		body,
	)
}

/** Every row of a run. */
async function rows(id: string) {
	const reply = await api.send<ImportRowPage>(
		'toby',
		'GET',
		`${base}/runs/${seg(id)}/rows?limit=100`,
	)
	expect(reply.status).toBe(200)
	return reply.body.items
}

/** Upload and validate, returning the validated run. */
async function validated(
	csv: string,
	intendedAction = 'Create',
	templateId = TEMPLATE,
): Promise<ImportRunDto> {
	const run = await upload(csv, intendedAction, templateId)
	expect(run.status, JSON.stringify(run.body)).toBe(201)
	expect(run.body.status).toBe('Uploaded')
	const checked = await act(run.body.id, 'validate', { expectedRevision: run.body.revision })
	expect(checked.status, JSON.stringify(checked.body)).toBe(200)
	return checked.body
}

describe('Employee Import', /** Import acceptance over the real module. */ () => {
	it('lists the seeded published template for HR only', /** Scenario. */ async () => {
		const list = await api.send<ImportTemplatePage>('toby', 'GET', `${base}/templates`)
		expect(list.status).toBe(200)
		const seeded = list.body.items.find(/** Seeded. */ (item) => item.id === TEMPLATE)
		expect(seeded).toMatchObject({ code: 'NEW_HIRES', status: 'Published', columnCount: 11 })
		const detail = await api.send<ImportTemplateDetailDto>(
			'toby',
			'GET',
			`${base}/templates/${seg(TEMPLATE)}`,
		)
		expect(detail.body.columns.map(/** Field. */ (column) => column.fieldCode)).toContain(
			'worker-number',
		)
		expect(detail.body.actions).toEqual({ edit: false, publish: false, newVersion: true })
		expect((await api.send('jim', 'GET', `${base}/templates`)).status).toBe(403)
		expect((await api.send('michael', 'GET', `${base}/runs`)).status).toBe(403)
	})

	it('validates without side effects, blocks unresolved matches and commits row by row', /** Scenario. */ async () => {
		const csv = [
			HEADER,
			'Holly,Flax,DM-HOLLY,holly.flax@dundermifflin.example,DMPC,2026-02-01,scranton,HUMAN_RESOURCES,ACCOUNTANT,SCR-01,DM-MICHAEL',
			'Bad,Row,DM-BAD,,DMPC,01/02/2026,scranton,,ACCOUNTANT,NOWHERE,',
			'Jim,Again,DM-JIM2,jim.halpert@dundermifflin.example,DMPC,2026-02-01,scranton,,ACCOUNTANT,SCR-01,',
			'Taken,Number,DM-JIM,,DMPC,2026-02-01,scranton,,ACCOUNTANT,SCR-01,',
		].join('\n')
		const before = await api.admin.query('SELECT count(*)::int AS n FROM hcm.worker')
		const run = await validated(csv)
		expect(run).toMatchObject({
			status: 'ReadyToCommit',
			totalRowCount: 4,
			validRowCount: 2,
			invalidRowCount: 2,
			unresolvedRowCount: 1,
		})
		expect(run.parserVersion).toBe('hcm-import-1')
		expect(run.actions.commit).toBe(false)
		const after = await api.admin.query('SELECT count(*)::int AS n FROM hcm.worker')
		expect(after.rows[0].n).toBe(before.rows[0].n)

		const items = await rows(run.id)
		expect(
			items.map(
				/** Shape. */ (row) => [row.rowNumber, row.status, row.proposedAction, row.matchStatus],
			),
		).toEqual([
			[2, 'Valid', 'Create', 'None'],
			[3, 'Invalid', 'Reject', 'NotRequired'],
			[4, 'Valid', 'Create', 'Unique'],
			[5, 'Invalid', 'Reject', 'NotRequired'],
		])
		expect(items[1]?.issues.map(/** Code. */ (item) => item.code).sort()).toEqual([
			'invalid-date',
			'unknown-reference',
		])
		expect(items[3]?.issues.map(/** Code. */ (item) => item.code)).toEqual(['already-exists'])
		const match = items[2]
		expect(match?.needsResolution).toBe(true)
		expect(match?.candidates[0]?.workerNumber).toBe('DM-JIM')

		// DEC-HCM2-001: nothing commits while a matched row is unresolved.
		const blocked = await act(run.id, 'commit', { expectedRevision: run.revision })
		expect(blocked.status).toBe(409)
		const refused = await resolve(run.id, match?.id ?? '', {
			resolution: 'CreateNew',
			expectedRevision: match?.revision,
		})
		expect(refused.status).toBe(400)
		const resolved = await resolve(run.id, match?.id ?? '', {
			resolution: 'Skip',
			reason: 'Jim already works here',
			expectedRevision: match?.revision,
		})
		expect(resolved.status, JSON.stringify(resolved.body)).toBe(200)

		const ready = await api.send<ImportRunDto>('toby', 'GET', `${base}/runs/${seg(run.id)}`)
		expect(ready.body).toMatchObject({
			unresolvedRowCount: 0,
			actions: { commit: true, cancel: true },
		})
		const done = await act(run.id, 'commit', { expectedRevision: ready.body.revision })
		expect(done.status, JSON.stringify(done.body)).toBe(200)
		expect(done.body).toMatchObject({
			status: 'CompletedWithErrors',
			committedRowCount: 1,
			skippedRowCount: 1,
			invalidRowCount: 2,
		})

		const holly = await api.admin.query(
			`SELECT w.id,p.given_name AS "givenName",e.work_email AS "workEmail",a.job_title AS "jobTitle",
				(SELECT count(*)::int FROM hcm.reporting_line r WHERE r.tenant_id=a.tenant_id AND r.assignment_id=a.id) AS lines
				FROM hcm.worker w JOIN hcm.person p ON p.id=w.person_id AND p.tenant_id=w.tenant_id
				JOIN hcm.employment e ON e.worker_id=w.id AND e.tenant_id=w.tenant_id
				JOIN hcm.assignment a ON a.employment_id=e.id AND a.tenant_id=e.tenant_id
				WHERE w.worker_code='DM-HOLLY'`,
		)
		expect(holly.rows[0]).toMatchObject({
			givenName: 'Holly',
			workEmail: 'holly.flax@dundermifflin.example',
			jobTitle: 'Accountant',
			lines: 1,
		})
		const committed = await rows(run.id)
		expect(committed[0]).toMatchObject({ status: 'Committed', resultWorkerId: holly.rows[0].id })
		expect(committed[2]?.status).toBe('Skipped')

		// The issue report names rows, fields and codes but never a source value.
		const report = await api.send<string>('toby', 'GET', `${base}/runs/${seg(run.id)}/issues.csv`)
		expect(report.status).toBe(200)
		expect(report.cache).toBe('no-store')
		expect(report.body).toContain('3,Location,Location,Error,unknown-reference')
		expect(report.body).not.toContain('NOWHERE')
		expect(report.body).not.toContain('01/02/2026')
		const audit = await api.admin.query<{ action: string; category: string }>(
			'SELECT action,category FROM hcm.audit_event WHERE target_id=$1 ORDER BY occurred_at,id',
			[run.id],
		)
		expect(audit.rows.map(/** Action. */ (row) => row.action).sort()).toEqual(
			[
				'employee.import-issues-exported',
				'employee.import-row-resolved',
				'employee.import-run-committed',
				'employee.import-run-created',
				'employee.import-run-validated',
			].sort(),
		)
		expect(
			audit.rows.find(/** Export. */ (row) => row.action === 'employee.import-issues-exported')
				?.category,
		).toBe('export')
		const stored = await api.admin.query(
			"SELECT count(*)::int AS n FROM hcm.employee_import_issue WHERE safe_message LIKE '%NOWHERE%'",
		)
		expect(stored.rows[0].n).toBe(0)
	})

	it('versions templates and updates person facts only after a confirmed match', /** Scenario. */ async () => {
		const created = await api.send<ImportTemplateDetailDto & Failure>(
			'toby',
			'POST',
			`${base}/templates`,
			{
				code: 'NAME_FIXES',
				name: 'Name corrections',
				description: '',
				fileFormat: 'Csv',
				hasHeaderRow: true,
				dateFormat: 'dd/MM/yyyy',
				timeZone: 'America/New_York',
				reason: 'Correct preferred names in bulk',
				columns: [
					{
						sourceColumnName: 'Number',
						sourceColumnOrdinal: 1,
						fieldCode: 'worker-number',
						transformationCode: 'uppercase',
						isMatchKey: true,
					},
					{
						sourceColumnName: 'Preferred',
						sourceColumnOrdinal: 2,
						fieldCode: 'preferred-name',
						transformationCode: 'trim',
					},
				],
			},
		)
		expect(created.status, JSON.stringify(created.body)).toBe(201)
		expect(created.body).toMatchObject({
			status: 'Draft',
			versionNumber: 1,
			actions: { edit: true, publish: true },
		})
		const draftRun = await upload('Number,Preferred\nDM-PAM,Pammy', 'Update', created.body.id)
		expect(draftRun.status).toBe(400)

		const published = await api.send<ImportTemplateDetailDto>(
			'toby',
			'POST',
			`${base}/templates/${seg(created.body.id)}/publish`,
			{ expectedRevision: created.body.revision, reason: 'Ready' },
		)
		expect(published.status, JSON.stringify(published.body)).toBe(200)
		const edit = await api.send<Failure>(
			'toby',
			'PUT',
			`${base}/templates/${seg(created.body.id)}`,
			{
				name: 'Name corrections',
				description: '',
				fileFormat: 'Csv',
				hasHeaderRow: true,
				dateFormat: 'dd/MM/yyyy',
				timeZone: 'America/New_York',
				columns: [
					{
						sourceColumnName: 'Number',
						sourceColumnOrdinal: 1,
						fieldCode: 'worker-number',
						isMatchKey: true,
					},
				],
				expectedRevision: published.body.revision,
				reason: 'Too late',
			},
		)
		expect(edit.status).toBe(409)

		const run = await validated(
			'Number,Preferred\ndm-pam, Pammy \nDM-NOBODY,Ghost',
			'Update',
			created.body.id,
		)
		expect(run).toMatchObject({
			status: 'ReadyToCommit',
			validRowCount: 1,
			invalidRowCount: 1,
			unresolvedRowCount: 1,
		})
		const [pam, ghost] = await rows(run.id)
		expect(pam).toMatchObject({ proposedAction: 'Update', matchStatus: 'Unique' })
		expect(ghost?.issues.map(/** Code. */ (item) => item.code)).toEqual(['no-match'])
		const pamId = pam?.candidates[0]?.workerId ?? ''
		const resolved = await resolve(run.id, pam?.id ?? '', {
			resolution: 'UseExisting',
			candidateWorkerId: pamId,
			expectedRevision: pam?.revision,
		})
		expect(resolved.status, JSON.stringify(resolved.body)).toBe(200)
		const current = await api.send<ImportRunDto>('toby', 'GET', `${base}/runs/${seg(run.id)}`)
		const done = await act(run.id, 'commit', { expectedRevision: current.body.revision })
		expect(done.body).toMatchObject({ status: 'CompletedWithErrors', committedRowCount: 1 })
		const facts = await api.admin.query(
			'SELECT p.preferred_name AS "preferredName",p.given_name AS "givenName" FROM hcm.worker w JOIN hcm.person p ON p.id=w.person_id AND p.tenant_id=w.tenant_id WHERE w.id=$1',
			[pamId],
		)
		expect(facts.rows[0]).toMatchObject({ preferredName: 'Pammy', givenName: 'Pam' })

		const next = await api.send<ImportTemplateDetailDto>(
			'toby',
			'POST',
			`${base}/templates/${seg(created.body.id)}/versions`,
			{ reason: 'Add middle names' },
		)
		expect(next.status, JSON.stringify(next.body)).toBe(201)
		expect(next.body).toMatchObject({ code: 'NAME_FIXES', versionNumber: 2, status: 'Draft' })
		expect(next.body.columns).toHaveLength(2)
		const second = await api.send<ImportTemplateDetailDto>(
			'toby',
			'POST',
			`${base}/templates/${seg(next.body.id)}/publish`,
			{
				expectedRevision: next.body.revision,
				reason: 'Ready',
			},
		)
		expect(second.body.status).toBe('Published')
		const first = await api.send<ImportTemplateDetailDto>(
			'toby',
			'GET',
			`${base}/templates/${seg(created.body.id)}`,
		)
		expect(first.body.status).toBe('Retired')
	})

	it('refuses unreadable files, header drift and cancels before commit', /** Scenario. */ async () => {
		const pdf = await upload('%PDF-1.7\n', 'Create', TEMPLATE, 'hires.pdf', 'application/pdf')
		expect(pdf.status).toBe(415)
		const drift = await validated(
			HEADER.replace('Worker number', 'Employee ID') +
				'\nA,B,C,,DMPC,2026-02-01,scranton,,ACCOUNTANT,SCR-01,',
		)
		expect(drift).toMatchObject({
			status: 'Failed',
			failureCode: 'header-mismatch',
			totalRowCount: 0,
		})
		const run = await upload(`${HEADER}\n`)
		const cancelled = await act(run.body.id, 'cancel', {
			expectedRevision: run.body.revision,
			reason: 'Wrong file',
		})
		expect(cancelled.status).toBe(200)
		expect(cancelled.body).toMatchObject({ status: 'Cancelled', cancelReason: 'Wrong file' })
		expect(
			(await act(run.body.id, 'validate', { expectedRevision: cancelled.body.revision })).status,
		).toBe(409)
		const list = await api.send<ImportRunPage>('toby', 'GET', `${base}/runs?limit=2`)
		expect(list.body.items[0]?.id).toBe(run.body.id)
		expect(list.body.nextCursor).not.toBeNull()
	})
})
