import { afterAll, beforeAll, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type {
	DirectoryPersonDto,
	MyProfileDto,
	MyProfileFieldDto,
	MyReferencePage,
} from '@empflowyee/hcm-employee-contract'
import { HcmEmployeeModule } from './hcm-api-employee-module'
import { startHcmTestApi, type HcmTestApi } from './employee-test-harness'

let api: HcmTestApi
const base = 'employee/me/profile'
const P = 'dunder-mifflin/'
const TENANT = 'local-dunder-mifflin'

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

/** Jim's own profile. */
async function jim(): Promise<MyProfileDto> {
	const reply = await api.send<MyProfileDto>('jim', 'GET', base)
	expect(reply.status).toBe(200)
	return reply.body
}

/** One field of a profile by code. */
function field(profile: MyProfileDto, code: string): MyProfileFieldDto | undefined {
	return profile.fields.find(/** By code. */ (entry) => entry.code === code)
}

/** Apply a tenant policy row for the duration of a case. */
async function policy<T>(
	code: string,
	values: { requiredness: string; visibility: string; mode: string },
	work: () => Promise<T>,
): Promise<T> {
	await api.admin.query(
		"INSERT INTO hcm.profile_field_tenant_policy(tenant_id,id,standard_field_code,requiredness_context,requiredness,visibility,self_edit_mode) VALUES ($1,'mp-'||$2,$2,'WorkforceActivation',$3,$4,$5)",
		[TENANT, code, values.requiredness, values.visibility, values.mode],
	)
	try {
		return await work()
	} finally {
		await api.admin.query("DELETE FROM hcm.profile_field_tenant_policy WHERE id='mp-'||$1", [code])
	}
}

it('reads the Self allowlist with edit modes and read-only employment facts', /** TEST-MY-PROFILE-001, TEST-MY-PROFILE-005. */ async () => {
	const reply = await api.send<MyProfileDto>('jim', 'GET', base)
	expect(reply.cache).toBe('no-store')
	const profile = reply.body
	expect(profile).toMatchObject({
		linked: true,
		displayName: 'Jim Halpert',
		workerNumber: 'DM-JIM',
		contactPoints: [],
		relationships: [],
		correctionsAvailable: false,
	})
	expect(profile.fields).toHaveLength(36)
	expect(field(profile, 'preferred-name')).toMatchObject({
		editMode: 'Direct',
		visibility: 'Organization',
		preference: { visibility: null, options: ['Self', 'Hr', 'Manager', 'Organization'] },
	})
	expect(field(profile, 'legal-given-name')).toMatchObject({
		value: 'Jim',
		editMode: 'ServiceRequest',
	})
	expect(field(profile, 'display-name')).toMatchObject({
		editMode: 'NotEditable',
		preference: null,
	})
	expect(field(profile, 'work-mode')?.visibility).toBe('Manager')
	expect(profile.employments).toEqual([
		expect.objectContaining({
			primary: true,
			employmentType: 'Permanent',
			employmentStatus: 'Active',
			hireDate: '2001-10-01',
			probationStatus: 'Confirmed',
			workEmail: 'jim.halpert@dundermifflin.example',
			assignments: [
				expect.objectContaining({
					primary: true,
					designation: 'Sales Representative',
					department: 'Sales',
					manager: { workerId: P + 'worker/michael', displayName: 'Michael Scott' },
					workMode: 'OnSite',
				}),
			],
		}),
	])
	await policy(
		'nationality',
		{ requiredness: 'Hidden', visibility: 'Hr', mode: 'NotEditable' },
		/** A Hidden field is visible to nobody, the worker included. */ async () => {
			expect(field(await jim(), 'nationality')).toBeUndefined()
		},
	)
	await policy(
		'home-address',
		{ requiredness: 'Hidden', visibility: 'Hr', mode: 'NotEditable' },
		/** Collections disappear with their field. */ async () => {
			expect(await jim()).not.toHaveProperty('addresses')
		},
	)
})

it('explains an account without a linked worker instead of failing', /** TEST-MY-PROFILE-001. */ async () => {
	await api.admin.query(
		"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES ($1,'unlinked-person','Temp','Visitor','Temp Visitor')",
		[TENANT],
	)
	await api.admin.query("UPDATE hcm.user_account SET person_id='unlinked-person' WHERE id=$1", [
		P + 'account/toby',
	])
	try {
		const reply = await api.send<MyProfileDto>('toby', 'GET', base)
		expect(reply.status).toBe(200)
		expect(reply.body).toEqual({
			linked: false,
			displayName: null,
			workerNumber: null,
			personRevision: null,
			fields: [],
			employments: [],
			correctionsAvailable: false,
		})
		const write = await api.send('toby', 'PUT', `${base}/personal`, {
			preferredName: 'X',
			expectedRevision: 1,
		})
		expect(write.status).toBe(404)
	} finally {
		await api.admin.query('UPDATE hcm.user_account SET person_id=$1 WHERE id=$2', [
			P + 'person/toby',
			P + 'account/toby',
		])
		await api.admin.query("DELETE FROM hcm.person WHERE id='unlinked-person'")
	}
})

it('edits direct personal facts with revisions, audit and replay', /** TEST-MY-PROFILE-002, TEST-MY-PROFILE-008. */ async () => {
	const before = await jim()
	const key = randomUUID()
	const body = {
		preferredName: 'Big Tuna',
		bloodGroup: 'O+',
		expectedRevision: before.personRevision,
	}
	const saved = await api.send<MyProfileDto>('jim', 'PUT', `${base}/personal`, body, {
		'idempotency-key': key,
	})
	expect(saved.status).toBe(200)
	expect(saved.body.displayName).toBe('Big Tuna Halpert')
	expect(field(saved.body, 'blood-group')?.value).toBe('O+')
	const replay = await api.send<MyProfileDto>('jim', 'PUT', `${base}/personal`, body, {
		'idempotency-key': key,
	})
	expect(replay.body).toEqual(saved.body)
	const other = await api.send(
		'jim',
		'PUT',
		`${base}/personal`,
		{ ...body, bloodGroup: 'A+' },
		{
			'idempotency-key': key,
		},
	)
	expect(other.status).toBe(409)
	expect((await api.send('jim', 'PUT', `${base}/personal`, body)).status).toBe(409)
	const audit = await api.admin.query<{ fields: string[]; summary: string }>(
		"SELECT safe_summary->'changedFields' AS fields,safe_summary::text AS summary FROM hcm.audit_event WHERE action='employee.my-profile-changed' AND target_id=$1",
		[P + 'person/jim'],
	)
	expect(audit.rows).toHaveLength(1)
	expect(audit.rows[0]?.fields).toEqual(['preferredName', 'bloodGroup'])
	expect(audit.rows[0]?.summary).not.toMatch(/Tuna|O\+/)
	await policy(
		'blood-group',
		{ requiredness: 'Optional', visibility: 'Hr', mode: 'ServiceRequest' },
		/** Edit mode is re-evaluated for every command. */ async () => {
			const refused = await api.send<{ code: string }>('jim', 'PUT', `${base}/personal`, {
				bloodGroup: null,
				expectedRevision: saved.body.personRevision,
			})
			expect(refused.status).toBe(400)
			expect(refused.body.code).toBe('field-not-editable')
		},
	)
	const legal = await api.send('jim', 'PUT', `${base}/personal`, {
		givenName: 'James',
		expectedRevision: saved.body.personRevision,
	})
	expect(legal.status).toBe(400)
	const reset = await api.send<MyProfileDto>('jim', 'PUT', `${base}/personal`, {
		preferredName: '',
		bloodGroup: null,
		expectedRevision: saved.body.personRevision,
	})
	expect(reset.body.displayName).toBe('Jim Halpert')
})

it('keeps personal contacts unverified with one primary per type', /** TEST-MY-PROFILE-002. */ async () => {
	const first = await api.send<MyProfileDto>('jim', 'POST', `${base}/contact-points`, {
		type: 'PersonalEmail',
		value: 'bigtuna@example.com',
	})
	expect(first.status).toBe(201)
	expect(first.body.contactPoints).toEqual([
		expect.objectContaining({ value: 'bigtuna@example.com', primary: true, verified: false }),
	])
	expect(
		(
			await api.send('jim', 'POST', `${base}/contact-points`, {
				type: 'PersonalEmail',
				value: 'not-an-email',
			})
		).status,
	).toBe(400)
	expect(
		(await api.send('jim', 'POST', `${base}/contact-points`, { type: 'HomePhone', value: '12345' }))
			.status,
	).toBe(400)
	const second = await api.send<MyProfileDto>('jim', 'POST', `${base}/contact-points`, {
		type: 'PersonalEmail',
		value: 'jim@example.com',
	})
	const added = second.body.contactPoints?.find(
		/** New one. */ (c) => c.value === 'jim@example.com',
	)
	expect(added?.primary).toBe(false)
	const promoted = await api.send<MyProfileDto>(
		'jim',
		'PUT',
		`${base}/contact-points/${encodeURIComponent(added?.id ?? '')}`,
		{ value: 'jim@example.com', primary: true, expectedRevision: added?.revision },
	)
	expect(
		promoted.body.contactPoints
			?.filter(/** Primary. */ (c) => c.primary)
			.map(/** Value. */ (c) => c.value),
	).toEqual(['jim@example.com'])
	// Removing the primary promotes the remaining one, so each removal quotes a fresh revision.
	for (let contact = promoted.body.contactPoints?.[0]; contact;) {
		const removed = await api.send<MyProfileDto>(
			'jim',
			'POST',
			`${base}/contact-points/${encodeURIComponent(contact.id)}/deactivate`,
			{ expectedRevision: contact.revision },
		)
		expect(removed.status).toBe(200)
		contact = removed.body.contactPoints?.[0]
	}
	expect((await jim()).contactPoints).toEqual([])
	expect(
		(
			await api.send(
				'michael',
				'PUT',
				`${base}/contact-points/${encodeURIComponent(added?.id ?? '')}`,
				{ value: 'x@example.com', primary: true, expectedRevision: 1 },
			)
		).status,
	).toBe(404)
})

it('maintains emergency contacts and dependants within their rules', /** TEST-MY-PROFILE-002. */ async () => {
	const spouse = {
		relationshipType: 'SPOUSE',
		fullName: 'Pam Halpert',
		contactNumber: '+1 570 555 0100',
		dependent: true,
		emergencyContact: true,
		emergencyPriority: 1,
	}
	const added = await api.send<MyProfileDto>('jim', 'POST', `${base}/relationships`, spouse)
	expect(added.status).toBe(201)
	expect(added.body.relationships).toEqual([
		expect.objectContaining({
			fullName: 'Pam Halpert',
			relationshipName: 'Spouse',
			emergencyPriority: 1,
		}),
	])
	const duplicate = await api.send<{
		code: string
		fieldErrors: { field: string; code: string }[]
	}>('jim', 'POST', `${base}/relationships`, {
		...spouse,
		relationshipType: 'FATHER',
		fullName: 'Gerald Halpert',
		dependent: false,
	})
	expect(duplicate.status).toBe(400)
	expect(duplicate.body.fieldErrors).toEqual([{ field: 'emergencyPriority', code: 'duplicate' }])
	const friend = await api.send<{ fieldErrors: { field: string; code: string }[] }>(
		'jim',
		'POST',
		`${base}/relationships`,
		{ ...spouse, relationshipType: 'FRIEND', fullName: 'Dwight', emergencyPriority: 2 },
	)
	expect(friend.status).toBe(400)
	expect(friend.body.fieldErrors).toEqual([{ field: 'dependent', code: 'not-eligible' }])
	expect(
		(
			await api.send('jim', 'POST', `${base}/relationships`, {
				...spouse,
				emergencyPriority: undefined,
			})
		).status,
	).toBe(400)
	const row = added.body.relationships?.[0]
	const updated = await api.send<MyProfileDto>(
		'jim',
		'PUT',
		`${base}/relationships/${encodeURIComponent(row?.id ?? '')}`,
		{ ...spouse, emergencyPriority: 2, expectedRevision: row?.revision },
	)
	expect(updated.body.relationships?.[0]?.emergencyPriority).toBe(2)
	await policy(
		'emergency-contacts',
		{ requiredness: 'Optional', visibility: 'Hr', mode: 'NotEditable' },
		/** Emergency contacts stop being editable while family members stay editable. */ async () => {
			const refused = await api.send<{ code: string }>(
				'jim',
				'POST',
				`${base}/relationships/${encodeURIComponent(row?.id ?? '')}/deactivate`,
				{ expectedRevision: 2 },
			)
			expect(refused.body.code).toBe('field-not-editable')
			const child = await api.send('jim', 'POST', `${base}/relationships`, {
				relationshipType: 'DAUGHTER',
				fullName: 'Cece Halpert',
				birthDate: '2009-05-14',
				dependent: true,
				emergencyContact: false,
			})
			expect(child.status).toBe(201)
		},
	)
	for (const relationship of (await jim()).relationships ?? [])
		expect(
			(
				await api.send(
					'jim',
					'POST',
					`${base}/relationships/${encodeURIComponent(relationship.id)}/deactivate`,
					{ expectedRevision: relationship.revision },
				)
			).status,
		).toBe(200)
	expect((await jim()).relationships).toEqual([])
	const options = await api.send<MyReferencePage>(
		'jim',
		'GET',
		`${base}/options/relationship-types?q=sp`,
	)
	expect(options.body.items).toEqual([{ code: 'SPOUSE', name: 'Spouse', dependentEligible: true }])
	expect((await api.send('jim', 'GET', `${base}/options/countries`)).status).toBe(400)
})

it('records direct custom values and refuses protected ones', /** TEST-MY-PROFILE-002. */ async () => {
	await api.admin.query(
		"INSERT INTO hcm.custom_field_definition(tenant_id,id,code,name,owner_scope,data_type,sensitivity,section_code) VALUES ($1,'mp-shirt','SHIRT','Shirt size','Worker','SingleSelect','Personal','Other'),($1,'mp-badge','BADGE','Badge','Person','Text','Sensitive','Other')",
		[TENANT],
	)
	await api.admin.query(
		"INSERT INTO hcm.custom_field_option(tenant_id,id,custom_field_id,code,name) VALUES ($1,'mp-shirt-m','mp-shirt','M','Medium'),($1,'mp-shirt-l','mp-shirt','L','Large')",
		[TENANT],
	)
	await api.admin.query(
		"INSERT INTO hcm.profile_field_tenant_policy(tenant_id,id,custom_field_id,requiredness_context,requiredness,visibility,self_edit_mode) VALUES ($1,'mp-shirt-policy','mp-shirt','WorkforceActivation','Optional','Manager','Direct'),($1,'mp-badge-policy','mp-badge','WorkforceActivation','Optional','Hr','Direct')",
		[TENANT],
	)
	try {
		const shirt = field(await jim(), 'SHIRT')
		expect(shirt).toMatchObject({
			editMode: 'Direct',
			custom: { dataType: 'SingleSelect', value: null, revision: null, storable: true },
		})
		const set = await api.send<MyProfileDto>('jim', 'PUT', `${base}/custom-fields/mp-shirt`, {
			value: 'mp-shirt-m',
		})
		expect(field(set.body, 'SHIRT')?.custom).toMatchObject({ value: 'mp-shirt-m', revision: 1 })
		const replaced = await api.send<MyProfileDto>('jim', 'PUT', `${base}/custom-fields/mp-shirt`, {
			value: 'mp-shirt-l',
			expectedRevision: 1,
		})
		expect(field(replaced.body, 'SHIRT')?.custom).toMatchObject({
			value: 'mp-shirt-l',
			revision: 2,
		})
		// A value recorded on an earlier day is superseded, keeping its history.
		await api.admin.query(
			"UPDATE hcm.custom_field_value SET effective_from='2020-01-01' WHERE custom_field_id='mp-shirt'",
		)
		const superseded = await api.send<MyProfileDto>(
			'jim',
			'PUT',
			`${base}/custom-fields/mp-shirt`,
			{
				value: 'mp-shirt-m',
				expectedRevision: 2,
			},
		)
		expect(field(superseded.body, 'SHIRT')?.custom).toMatchObject({
			value: 'mp-shirt-m',
			revision: 1,
		})
		const history = await api.admin.query<{ closed: boolean; linked: boolean }>(
			"SELECT effective_to IS NOT NULL AS closed,superseded_by_id IS NOT NULL AS linked FROM hcm.custom_field_value WHERE custom_field_id='mp-shirt' ORDER BY effective_from",
		)
		expect(history.rows).toEqual([
			{ closed: true, linked: true },
			{ closed: false, linked: false },
		])
		expect(
			(await api.send('jim', 'PUT', `${base}/custom-fields/mp-shirt`, { value: 'mp-shirt-m' }))
				.status,
		).toBe(409)
		expect(
			(
				await api.send('jim', 'PUT', `${base}/custom-fields/mp-shirt`, {
					value: 'unknown',
					expectedRevision: 1,
				})
			).status,
		).toBe(400)
		expect(field(await jim(), 'BADGE')).toMatchObject({
			editMode: 'NotEditable',
			custom: { storable: false },
		})
		const badge = await api.send<{ code: string }>('jim', 'PUT', `${base}/custom-fields/mp-badge`, {
			value: 'B-1',
		})
		expect(badge.body.code).toBe('field-not-editable')
	} finally {
		await api.admin.query(
			"DELETE FROM hcm.custom_field_value_option WHERE value_id IN (SELECT id FROM hcm.custom_field_value WHERE custom_field_id IN ('mp-shirt','mp-badge'))",
		)
		await api.admin.query(
			"DELETE FROM hcm.custom_field_value WHERE custom_field_id IN ('mp-shirt','mp-badge')",
		)
		await api.admin.query(
			"DELETE FROM hcm.profile_field_tenant_policy WHERE id IN ('mp-shirt-policy','mp-badge-policy')",
		)
		await api.admin.query("DELETE FROM hcm.custom_field_option WHERE custom_field_id='mp-shirt'")
		await api.admin.query(
			"DELETE FROM hcm.custom_field_definition WHERE id IN ('mp-shirt','mp-badge')",
		)
	}
})

it('narrows visibility by preference and never widens it', /** TEST-MY-PROFILE-004. */ async () => {
	const profile = await jim()
	await api.send('jim', 'PUT', `${base}/personal`, {
		preferredName: 'Jimmy',
		expectedRevision: profile.personRevision,
	})
	/** Toby's directory view of Jim. */
	const seen = async () =>
		(
			await api.send<DirectoryPersonDto>(
				'toby',
				'GET',
				`employee/directory/${encodeURIComponent(P + 'worker/jim')}`,
			)
		).body
	expect(await seen()).toHaveProperty('preferredName', 'Jimmy')
	const narrowed = await api.send<MyProfileDto>(
		'jim',
		'PUT',
		`${base}/visibility/standard:preferred-name`,
		{
			visibility: 'Hr',
		},
	)
	expect(narrowed.status).toBe(200)
	expect(field(narrowed.body, 'preferred-name')).toMatchObject({
		visibility: 'Hr',
		preference: { visibility: 'Hr', revision: 1 },
	})
	expect(await seen()).not.toHaveProperty('preferredName')
	expect(
		(await api.send('jim', 'PUT', `${base}/visibility/standard:work-email`, { visibility: 'Hr' }))
			.status,
	).toBe(400)
	await policy(
		'preferred-name',
		{ requiredness: 'Optional', visibility: 'Manager', mode: 'Direct' },
		/** A tenant policy caps the worker's choices. */ async () => {
			const wide = await api.send<{ code: string }>(
				'jim',
				'PUT',
				`${base}/visibility/standard:preferred-name`,
				{ visibility: 'Organization', expectedRevision: 1 },
			)
			expect(wide.status).toBe(400)
		},
	)
	const cleared = await api.send<MyProfileDto>(
		'jim',
		'PUT',
		`${base}/visibility/standard:preferred-name`,
		{
			visibility: null,
			expectedRevision: 1,
		},
	)
	expect(field(cleared.body, 'preferred-name')?.preference?.visibility).toBeNull()
	expect(await seen()).toHaveProperty('preferredName', 'Jimmy')
	const latest = await jim()
	await api.send('jim', 'PUT', `${base}/personal`, {
		preferredName: '',
		expectedRevision: latest.personRevision,
	})
})

it('authorizes every request from the verified account alone', /** TEST-MY-PROFILE-006. */ async () => {
	for (const persona of ['jim', 'michael', 'toby', 'david']) {
		const own = await api.send<MyProfileDto>(persona, 'GET', base)
		expect(own.status).toBe(200)
		expect(own.body.linked).toBe(true)
	}
	expect((await api.send('jim', 'GET', `${base}?workerId=${P}worker/michael`)).status).toBe(200)
	expect(
		(
			await api.send('jim', 'PUT', `${base}/personal`, {
				preferredName: 'X',
				expectedRevision: 1,
				workerId: 'x',
			})
		).status,
	).toBe(400)
	await api.admin.query(
		"DELETE FROM hcm.role_permission WHERE role_id='employee' AND permission_code='hcm.employee.profile.self.manage'",
	)
	try {
		const profile = await jim()
		expect(
			(
				await api.send('jim', 'PUT', `${base}/personal`, {
					preferredName: 'X',
					expectedRevision: profile.personRevision,
				})
			).status,
		).toBe(403)
	} finally {
		await api.admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'employee','hcm.employee.profile.self.manage')",
			[TENANT],
		)
	}
	await api.admin.query("UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.employee'")
	try {
		expect((await api.send('jim', 'GET', base)).status).toBe(403)
	} finally {
		await api.admin.query(
			"UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.employee'",
		)
	}
	await api.admin.query('UPDATE hcm.user_account SET enabled=false WHERE id=$1', [
		P + 'account/jim',
	])
	try {
		expect([401, 403]).toContain((await api.send('jim', 'GET', base)).status)
	} finally {
		await api.admin.query('UPDATE hcm.user_account SET enabled=true WHERE id=$1', [
			P + 'account/jim',
		])
	}
	expect([404, 405]).toContain((await api.send('jim', 'DELETE', base)).status)
})
