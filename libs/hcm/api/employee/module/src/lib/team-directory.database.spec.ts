import { afterAll, beforeAll, expect, it } from 'vitest'
import type { TeamMemberDto, TeamPage } from '@empflowyee/hcm-employee-contract'
import { HcmEmployeeModule } from './hcm-api-employee-module'
import { startHcmTestApi, type HcmTestApi } from './employee-test-harness'

let api: HcmTestApi
const base = 'employee/team'
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
function names(page: TeamPage): (string | undefined)[] {
	return page.items.map(/** Name. */ (entry) => entry.displayName)
}

it('lists exactly the direct reports on current primary solid lines', /** REQ-001, DEC-HCM2-015. */ async () => {
	const team = await api.send<TeamPage>('michael', 'GET', base)
	expect(team.status).toBe(200)
	expect(team.cache).toBe('no-store')
	expect(names(team.body)).toEqual(['Dwight Schrute', 'Jim Halpert', 'Pam Beesly'])
	expect(team.body.items.find(/** Jim. */ (entry) => entry.workerId === P + 'worker/jim')).toEqual({
		workerId: P + 'worker/jim',
		displayName: 'Jim Halpert',
		designation: 'Sales Representative',
		location: expect.any(String),
		employmentStatus: 'Active',
		probationStatus: 'Confirmed',
	})
	await api.admin.query(
		"INSERT INTO hcm.reporting_line(tenant_id,id,assignment_id,manager_assignment_id,reporting_line_type,is_primary,effective_from) VALUES ('local-dunder-mifflin','angela-dotted',$1,$2,'Dotted',false,'2020-01-01')",
		[P + 'assignment/angela', P + 'assignment/michael'],
	)
	try {
		expect(names((await api.send<TeamPage>('michael', 'GET', base)).body)).not.toContain(
			'Angela Martin',
		)
	} finally {
		await api.admin.query("DELETE FROM hcm.reporting_line WHERE id='angela-dotted'")
	}
	await api.admin.query('UPDATE hcm.reporting_line SET manager_assignment_id=$1 WHERE id=$2', [
		P + 'assignment/david',
		P + 'reporting-line/jim',
	])
	try {
		expect(names((await api.send<TeamPage>('michael', 'GET', base)).body)).toEqual([
			'Dwight Schrute',
			'Pam Beesly',
		])
		expect(
			(await api.send('michael', 'GET', `${base}/${encodeURIComponent(P + 'worker/jim')}`)).status,
		).toBe(404)
	} finally {
		await api.admin.query('UPDATE hcm.reporting_line SET manager_assignment_id=$1 WHERE id=$2', [
			P + 'assignment/michael',
			P + 'reporting-line/jim',
		])
	}
	expect(names((await api.send<TeamPage>('michael', 'GET', `${base}?q=halp`)).body)).toEqual([
		'Jim Halpert',
	])
	expect(
		names((await api.send<TeamPage>('michael', 'GET', `${base}?probationStatus=InProgress`)).body),
	).toEqual([])
	expect((await api.send('michael', 'GET', `${base}?probationStatus=Unknown`)).status).toBe(400)
})

it('shows manager-visible employment facts and never personal data', /** REQ-002. */ async () => {
	const jim = await api.send<TeamMemberDto>(
		'michael',
		'GET',
		`${base}/${encodeURIComponent(P + 'worker/jim')}`,
	)
	expect(jim.status).toBe(200)
	expect(jim.body).toMatchObject({
		workerNumber: 'DM-JIM',
		workEmail: 'jim.halpert@dundermifflin.example',
		department: 'Sales',
		employmentType: 'Permanent',
		employmentStatus: 'Active',
		hireDate: '2001-10-01',
		continuousServiceStartDate: '2001-10-01',
		probationStatus: 'Confirmed',
		probationEndDate: '2002-04-01',
		noticePeriodDays: 30,
		workMode: 'OnSite',
		fullTimeEquivalent: 1,
		standardHoursPerWeek: 40,
	})
	for (const hidden of [
		'birthDate',
		'address',
		'homeAddress',
		'personalEmail',
		'mobilePhone',
		'gender',
		'bloodGroup',
		'emergencyContacts',
		'familyMembers',
		'nationality',
	])
		expect(jim.body).not.toHaveProperty(hidden)
	expect(
		(await api.send('michael', 'GET', `${base}/${encodeURIComponent(P + 'worker/angela')}`)).status,
	).toBe(404)
})

it('requires the explicit team permission; the reporting line grants nothing', /** REQ-003. */ async () => {
	for (const persona of ['jim', 'toby', 'david'])
		expect((await api.send(persona, 'GET', base)).status).toBe(403)
	await api.admin.query(
		"DELETE FROM hcm.role_permission WHERE role_id='manager' AND permission_code='hcm.employee.team.read'",
	)
	try {
		expect((await api.send('michael', 'GET', base)).status).toBe(403)
		expect(
			(await api.send('michael', 'GET', `${base}/${encodeURIComponent(P + 'worker/jim')}`)).status,
		).toBe(403)
	} finally {
		await api.admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES('local-dunder-mifflin','manager','hcm.employee.team.read')",
		)
	}
	await api.admin.query("UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.employee'")
	try {
		expect((await api.send('michael', 'GET', base)).status).toBe(403)
	} finally {
		await api.admin.query(
			"UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.employee'",
		)
	}
	for (const method of ['POST', 'PUT', 'DELETE'])
		expect([404, 405]).toContain((await api.send('michael', method, base, {})).status)
})
