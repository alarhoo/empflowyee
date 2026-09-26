import { afterAll, beforeAll, expect, it } from 'vitest'
import type {
	DirectoryOptionPage,
	DirectoryPage,
	DirectoryPersonDto,
} from '@empflowyee/hcm-employee-contract'
import { HcmEmployeeModule } from './hcm-api-employee-module'
import { startHcmTestApi, type HcmTestApi } from './employee-test-harness'

let api: HcmTestApi
const base = 'employee/directory'
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
function names(page: DirectoryPage): (string | undefined)[] {
	return page.items.map(/** Name. */ (entry) => entry.displayName)
}

/** Search as a persona. */
function find(persona: string, query = '') {
	return api.send<DirectoryPage>(persona, 'GET', `${base}${query ? '?' + query : ''}`)
}

/** Narrow one standard field for the duration of a case. */
async function narrowed<T>(field: string, visibility: string, work: () => Promise<T>): Promise<T> {
	await api.admin.query(
		"INSERT INTO hcm.profile_field_tenant_policy(tenant_id,id,standard_field_code,requiredness_context,requiredness,visibility,self_edit_mode) SELECT 'local-dunder-mifflin','narrow-'||$1,$1,'WorkforceActivation',p.requiredness,$2,'NotEditable' FROM hcm.profile_field_default_policy p WHERE p.field_code=$1",
		[field, visibility],
	)
	try {
		return await work()
	} finally {
		await api.admin.query("DELETE FROM hcm.profile_field_tenant_policy WHERE id='narrow-'||$1", [
			field,
		])
	}
}

it('lists the current workforce with Organization fields, stable paging and name sorting', /** REQ-001, REQ-003. */ async () => {
	for (const persona of ['jim', 'michael', 'toby', 'david']) {
		const all = await find(persona)
		expect(all.status).toBe(200)
		expect(all.cache).toBe('no-store')
		expect(names(all.body)).toEqual([
			'Angela Martin',
			'David Wallace',
			'Dwight Schrute',
			'Jim Halpert',
			'Michael Scott',
			'Oscar Martinez',
			'Pam Beesly',
			'Toby Flenderson',
		])
	}
	const { body } = await find('jim')
	expect(body.items.find(/** Jim. */ (entry) => entry.workerId === P + 'worker/jim')).toEqual({
		workerId: P + 'worker/jim',
		displayName: 'Jim Halpert',
		designation: 'Sales Representative',
		department: 'Sales',
		location: expect.any(String),
		workEmail: 'jim.halpert@dundermifflin.example',
	})
	const first = await find('jim', 'limit=3&sort=name:desc')
	expect(names(first.body)).toEqual(['Toby Flenderson', 'Pam Beesly', 'Oscar Martinez'])
	const next = await find(
		'jim',
		`limit=3&sort=name:desc&cursor=${encodeURIComponent(first.body.nextCursor ?? '')}`,
	)
	expect(names(next.body)).toEqual(['Michael Scott', 'Jim Halpert', 'Dwight Schrute'])
	expect((await find('jim', 'sort=hireDate:asc')).status).toBe(400)
})

it('searches only fields the Organization may see', /** REQ-001 and REQ-002. */ async () => {
	expect(names((await find('jim', 'q=halp')).body)).toEqual(['Jim Halpert'])
	expect(names((await find('jim', 'q=dwight.s')).body)).toEqual(['Dwight Schrute'])
	expect(names((await find('jim', 'q=DM-OS')).body)).toEqual(['Oscar Martinez'])
	await api.admin.query(
		"INSERT INTO hcm.person_contact_point(tenant_id,id,person_id,contact_point_type,value,is_primary,is_active) VALUES ('local-dunder-mifflin','jim-personal',$1,'PersonalEmail','bigtuna@example.com',true,true)",
		[P + 'person/jim'],
	)
	try {
		expect(names((await find('jim', 'q=bigtuna')).body)).toEqual([])
	} finally {
		await api.admin.query("DELETE FROM hcm.person_contact_point WHERE id='jim-personal'")
	}
	await narrowed(
		'work-email',
		'Hr',
		/** Email hidden from the organisation. */ async () => {
			const { body } = await find('jim')
			expect(body.items.some(/** No email. */ (entry) => 'workEmail' in entry)).toBe(false)
			expect(names((await find('jim', 'q=dwight.s')).body)).toEqual([])
			const person = await api.send<DirectoryPersonDto>(
				'jim',
				'GET',
				`${base}/${encodeURIComponent(P + 'worker/jim')}`,
			)
			expect(person.body).not.toHaveProperty('workEmail')
		},
	)
})

it('filters by placement only while the field is Organization-visible', /** REQ-001. */ async () => {
	const options = await api.send<DirectoryOptionPage>(
		'jim',
		'GET',
		`${base}/options/departments?q=sal`,
	)
	expect(options.body.items.map(/** Name. */ (option) => option.name)).toEqual(['Sales'])
	const sales = options.body.items[0]?.id ?? ''
	expect(names((await find('jim', `departmentId=${encodeURIComponent(sales)}`)).body)).toEqual([
		'Dwight Schrute',
		'Jim Halpert',
	])
	await narrowed(
		'department',
		'Hr',
		/** Department hidden from the organisation. */ async () => {
			const refused = await find('jim', `departmentId=${encodeURIComponent(sales)}`)
			expect(refused.status).toBe(400)
			const hidden = await api.send<DirectoryOptionPage>(
				'jim',
				'GET',
				`${base}/options/departments`,
			)
			expect(hidden.body.items).toEqual([])
		},
	)
	expect((await api.send('jim', 'GET', `${base}/options/cost-centres`)).status).toBe(400)
})

it('shows a colleague with reporting context and concurrent assignments', /** REQ-003. */ async () => {
	const jim = await api.send<DirectoryPersonDto>(
		'toby',
		'GET',
		`${base}/${encodeURIComponent(P + 'worker/jim')}`,
	)
	expect(jim.status).toBe(200)
	expect(jim.body).toMatchObject({
		workerId: P + 'worker/jim',
		displayName: 'Jim Halpert',
		workerNumber: 'DM-JIM',
		manager: { workerId: P + 'worker/michael', displayName: 'Michael Scott' },
		directReportCount: 0,
		assignments: [
			{ assignmentId: P + 'assignment/jim', primary: true, designation: 'Sales Representative' },
		],
	})
	for (const hidden of ['birthDate', 'personalEmail', 'hireDate', 'employmentStatus', 'workMode'])
		expect(jim.body).not.toHaveProperty(hidden)
	const reports = await api.send<DirectoryPage>(
		'jim',
		'GET',
		`${base}/${encodeURIComponent(P + 'worker/michael')}/reports`,
	)
	expect(names(reports.body)).toEqual(['Dwight Schrute', 'Jim Halpert', 'Pam Beesly'])
	const michael = await api.send<DirectoryPersonDto>(
		'jim',
		'GET',
		`${base}/${encodeURIComponent(P + 'worker/michael')}`,
	)
	expect(michael.body.directReportCount).toBe(3)
})

it('includes the current workforce only, without employment status', /** REQ-004. */ async () => {
	await api.admin.query("UPDATE hcm.employment SET employment_status='Pending' WHERE id=$1", [
		P + 'employment/dwight',
	])
	await api.admin.query("UPDATE hcm.employment SET employment_status='Suspended' WHERE id=$1", [
		P + 'employment/pam',
	])
	try {
		const { body } = await find('jim')
		expect(names(body)).not.toContain('Dwight Schrute')
		const pam = body.items.find(/** Pam. */ (entry) => entry.workerId === P + 'worker/pam')
		expect(pam).toBeDefined()
		expect(JSON.stringify(pam)).not.toMatch(/Suspended|status/i)
		expect(
			(await api.send('jim', 'GET', `${base}/${encodeURIComponent(P + 'worker/dwight')}`)).status,
		).toBe(404)
	} finally {
		await api.admin.query(
			"UPDATE hcm.employment SET employment_status='Active' WHERE id IN ($1,$2)",
			[P + 'employment/dwight', P + 'employment/pam'],
		)
	}
})

it('authorizes every read independently of navigation', /** REQ-005. */ async () => {
	await api.admin.query(
		"DELETE FROM hcm.role_permission WHERE role_id='employee' AND permission_code='hcm.employee.directory.read'",
	)
	try {
		expect((await find('jim')).status).toBe(403)
	} finally {
		await api.admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES('local-dunder-mifflin','employee','hcm.employee.directory.read')",
		)
	}
	await api.admin.query("UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.employee'")
	try {
		expect((await find('david')).status).toBe(403)
	} finally {
		await api.admin.query(
			"UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.employee'",
		)
	}
	await api.admin.query('UPDATE hcm.user_account SET enabled=false WHERE id=$1', [
		P + 'account/jim',
	])
	try {
		expect([401, 403]).toContain((await find('jim')).status)
	} finally {
		await api.admin.query('UPDATE hcm.user_account SET enabled=true WHERE id=$1', [
			P + 'account/jim',
		])
	}
	expect(
		(await api.send('jim', 'GET', `${base}/${encodeURIComponent('foreign/worker/x')}`)).status,
	).toBe(404)
	for (const method of ['POST', 'PUT', 'DELETE'])
		expect([404, 405]).toContain((await api.send('david', method, base, {})).status)
})
