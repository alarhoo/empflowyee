import { afterAll, beforeAll, expect, it } from 'vitest'
import type {
	OrgChartNodeDto,
	OrgChartPage,
	OrgChartPersonDto,
} from '@empflowyee/hcm-workforce-foundation-contract'
import { HcmEmployeeModule } from './hcm-api-employee-module'
import { startHcmTestApi, type HcmTestApi } from './employee-test-harness'

// The org chart is a workforce app whose field policy the employee module implements; like the
// HCM API root, this spec composes both modules through the global employee module.
let api: HcmTestApi
const base = 'workforce-foundation/org-chart'
const P = 'dunder-mifflin/'

beforeAll(
	/** Start the real modules over the migrated and seeded disposable database. */ async () => {
		api = await startHcmTestApi(HcmEmployeeModule)
	},
)
afterAll(
	/** Release the application and connections. */ async () => {
		await api?.close()
	},
)

/** Display names of a page. */
function names(page: { items: OrgChartNodeDto[] }): (string | undefined)[] {
	return page.items.map(/** Name. */ (node) => node.displayName)
}

it('builds the hierarchy from current primary solid lines for every persona', /** REQ-001. */ async () => {
	for (const persona of ['jim', 'michael', 'toby', 'david']) {
		const roots = await api.send<OrgChartPage>(persona, 'GET', `${base}/roots`)
		expect(roots.status).toBe(200)
		expect(roots.cache).toBe('no-store')
		expect(names(roots.body)).toEqual(['Angela Martin', 'David Wallace', 'Oscar Martinez'])
	}
	const roots = await api.send<OrgChartPage>('jim', 'GET', `${base}/roots`)
	expect(roots.body.items[1]).toEqual({
		assignmentId: P + 'assignment/david',
		workerId: P + 'worker/david',
		displayName: 'David Wallace',
		designation: 'Chief Financial Officer',
		organisationUnit: expect.any(String),
		location: expect.any(String),
		directReportCount: 2,
		concurrentContextLabel: null,
	})
	const michael = await api.send<OrgChartPage>(
		'jim',
		'GET',
		`${base}/nodes/${encodeURIComponent(P + 'assignment/michael')}/reports?limit=2`,
	)
	expect(names(michael.body)).toEqual(['Dwight Schrute', 'Jim Halpert'])
	const rest = await api.send<OrgChartPage>(
		'jim',
		'GET',
		`${base}/nodes/${encodeURIComponent(P + 'assignment/michael')}/reports?limit=2&cursor=${encodeURIComponent(michael.body.nextCursor ?? '')}`,
	)
	expect(names(rest.body)).toEqual(['Pam Beesly'])
	expect(rest.body.nextCursor).toBeNull()
	expect((await api.send('jim', 'GET', `${base}/roots?q=x`)).status).toBe(400)
	expect((await api.send('jim', 'GET', `${base}/roots?limit=500`)).status).toBe(400)
})

it('shows only Organization-visible details and follows tenant narrowing', /** REQ-003. */ async () => {
	const jim = await api.send<OrgChartPersonDto>(
		'michael',
		'GET',
		`${base}/nodes/${encodeURIComponent(P + 'assignment/jim')}`,
	)
	expect(jim.body).toMatchObject({
		displayName: 'Jim Halpert',
		workerNumber: 'DM-JIM',
		designation: 'Sales Representative',
		department: 'Sales',
		workEmail: 'jim.halpert@dundermifflin.example',
		manager: { assignmentId: P + 'assignment/michael', displayName: 'Michael Scott' },
	})
	for (const hidden of ['birthDate', 'personalEmail', 'hireDate', 'workMode', 'employmentType'])
		expect(jim.body).not.toHaveProperty(hidden)
	await api.admin.query(
		"INSERT INTO hcm.profile_field_tenant_policy(tenant_id,id,standard_field_code,requiredness_context,requiredness,visibility,self_edit_mode) VALUES ('local-dunder-mifflin','chart-email','work-email','WorkforceActivation','Recommended','Hr','NotEditable')",
	)
	try {
		const narrowed = await api.send<OrgChartPersonDto>(
			'michael',
			'GET',
			`${base}/nodes/${encodeURIComponent(P + 'assignment/jim')}`,
		)
		expect(narrowed.body).not.toHaveProperty('workEmail')
		expect(narrowed.body.displayName).toBe('Jim Halpert')
	} finally {
		await api.admin.query("DELETE FROM hcm.profile_field_tenant_policy WHERE id='chart-email'")
	}
	const david = await api.send<OrgChartPersonDto>(
		'jim',
		'GET',
		`${base}/nodes/${encodeURIComponent(P + 'assignment/david')}`,
	)
	expect(david.body.manager).toBeNull()
})

it('finds people by name or worker number and reveals their path', /** REQ-002. */ async () => {
	const byName = await api.send<OrgChartPage>('jim', 'GET', `${base}/search?q=halp`)
	expect(names(byName.body)).toEqual(['Jim Halpert'])
	const byNumber = await api.send<OrgChartPage>('jim', 'GET', `${base}/search?q=DM-P`)
	expect(names(byNumber.body)).toEqual(['Pam Beesly'])
	const accent = await api.send<OrgChartPage>('jim', 'GET', `${base}/search?q=SCHRÜTE`)
	expect(names(accent.body)).toEqual(['Dwight Schrute'])
	expect(
		names(
			(await api.send<OrgChartPage>('jim', 'GET', `${base}/search?q=dundermifflin.example`)).body,
		),
	).toEqual([])
	expect((await api.send('jim', 'GET', `${base}/search?q=j`)).status).toBe(400)
	expect((await api.send('jim', 'GET', `${base}/search`)).status).toBe(400)
	const path = await api.send<{ items: OrgChartNodeDto[] }>(
		'jim',
		'GET',
		`${base}/nodes/${encodeURIComponent(P + 'assignment/jim')}/path`,
	)
	expect(names(path.body)).toEqual(['David Wallace', 'Michael Scott', 'Jim Halpert'])
	await api.admin.query(
		"INSERT INTO hcm.reporting_line(tenant_id,id,assignment_id,manager_assignment_id,reporting_line_type,is_primary,effective_from) VALUES ('local-dunder-mifflin','cycle-line',$1,$2,'Solid',true,'2005-01-01')",
		[P + 'assignment/david', P + 'assignment/jim'],
	)
	try {
		const cycle = await api.send<{ code: string }>(
			'jim',
			'GET',
			`${base}/nodes/${encodeURIComponent(P + 'assignment/jim')}/path`,
		)
		expect(cycle.status).toBe(409)
		expect(cycle.body.code).toBe('invalid-state')
	} finally {
		await api.admin.query("DELETE FROM hcm.reporting_line WHERE id='cycle-line'")
	}
})

it('excludes pending and ended employments and grants nothing', /** REQ-004. */ async () => {
	await api.admin.query("UPDATE hcm.employment SET employment_status='Pending' WHERE id=$1", [
		P + 'employment/dwight',
	])
	try {
		const reports = await api.send<OrgChartPage>(
			'jim',
			'GET',
			`${base}/nodes/${encodeURIComponent(P + 'assignment/michael')}/reports`,
		)
		expect(names(reports.body)).toEqual(['Jim Halpert', 'Pam Beesly'])
		expect(
			(await api.send('jim', 'GET', `${base}/nodes/${encodeURIComponent(P + 'assignment/dwight')}`))
				.status,
		).toBe(404)
	} finally {
		await api.admin.query("UPDATE hcm.employment SET employment_status='Active' WHERE id=$1", [
			P + 'employment/dwight',
		])
	}
	for (const method of ['POST', 'PUT', 'DELETE'])
		expect([404, 405]).toContain((await api.send('david', method, `${base}/roots`, {})).status)
})

it('authorizes every read independently of navigation', /** REQ-005. */ async () => {
	await api.admin.query(
		"DELETE FROM hcm.role_permission WHERE role_id='employee' AND permission_code='hcm.workforce-foundation.org-chart.read'",
	)
	try {
		expect((await api.send('jim', 'GET', `${base}/roots`)).status).toBe(403)
	} finally {
		await api.admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES('local-dunder-mifflin','employee','hcm.workforce-foundation.org-chart.read')",
		)
	}
	await api.admin.query(
		"UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.workforce-foundation'",
	)
	try {
		expect((await api.send('david', 'GET', `${base}/roots`)).status).toBe(403)
	} finally {
		await api.admin.query(
			"UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.workforce-foundation'",
		)
	}
	await api.admin.query('UPDATE hcm.user_account SET enabled=false WHERE id=$1', [
		P + 'account/jim',
	])
	try {
		expect([401, 403]).toContain((await api.send('jim', 'GET', `${base}/roots`)).status)
	} finally {
		await api.admin.query('UPDATE hcm.user_account SET enabled=true WHERE id=$1', [
			P + 'account/jim',
		])
	}
	expect(
		(
			await api.send(
				'jim',
				'GET',
				`${base}/nodes/${encodeURIComponent('foreign-tenant/assignment/x')}`,
			)
		).status,
	).toBe(404)
})
