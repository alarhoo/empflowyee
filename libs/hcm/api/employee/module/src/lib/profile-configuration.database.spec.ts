import { afterAll, beforeAll, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { ProfileFieldDetailDto, ProfileFieldList } from '@empflowyee/hcm-employee-contract'
import { HcmEmployeeModule } from './hcm-api-employee-module'
import { startHcmTestApi, type HcmTestApi } from './employee-test-harness'

let api: HcmTestApi
const base = 'employee'

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

/** Read one field detail as a persona. */
function detail(persona: string, ref: string) {
	return api.send<ProfileFieldDetailDto>(
		persona,
		'GET',
		`${base}/profile-fields/${encodeURIComponent(ref)}`,
	)
}

/** A narrowing body at a revision. */
function policyBody(visibility: string, expectedRevision: number, selfEditMode = 'NotEditable') {
	return {
		requiredness: 'Optional',
		visibility,
		selfEditMode,
		allowWorkerPreference: false,
		expectedRevision,
		reason: 'Align with policy',
	}
}

it('lists the product catalogue with tenant narrowing for HR and administrators', /** REQ-001: product rows from migration 000022. */ async () => {
	for (const persona of ['toby', 'david']) {
		const list = await api.send<ProfileFieldList>(persona, 'GET', `${base}/profile-fields`)
		expect(list.status).toBe(200)
		expect(list.cache).toBe('no-store')
		expect(list.body.items).toHaveLength(36)
	}
	const { body } = await api.send<ProfileFieldList>('toby', 'GET', `${base}/profile-fields`)
	expect(
		body.items.find(/** Legal name. */ (item) => item.code === 'legal-given-name'),
	).toMatchObject({
		ref: 'standard:legal-given-name',
		section: 'Identity',
		sensitivity: 'Personal',
		ceiling: 'Hr',
		searchable: false,
		custom: false,
		productDefault: {
			requiredness: 'Required',
			visibility: 'Hr',
			selfEditMode: 'ServiceRequest',
			allowWorkerPreference: false,
		},
		tenantPolicy: null,
	})
	const workMode = await detail('toby', 'standard:work-mode')
	expect(workMode.body).toMatchObject({
		tenantPolicy: { visibility: 'Manager', revision: 1 },
		policyRevision: 1,
		effectiveVisibility: 'Manager',
		preview: [
			{ relation: 'Self', visible: true, editMode: 'NotEditable' },
			{ relation: 'Hr', visible: true, editMode: null },
			{ relation: 'Manager', visible: true, editMode: null },
			{ relation: 'Organization', visible: false, editMode: null },
		],
	})
	expect((await api.send('toby', 'GET', `${base}/profile-fields?q=name`)).status).toBe(400)
	expect((await detail('toby', 'standard:unknown-field')).status).toBe(404)
	expect((await detail('toby', 'nonsense')).status).toBe(400)
})

it('narrows, refuses widening and resets tenant policy with audited idempotent commands', /** REQ-002 and REQ-008. */ async () => {
	const path = `${base}/profile-fields/${encodeURIComponent('standard:preferred-name')}/tenant-policy/WorkforceActivation`
	const key = randomUUID()
	const narrowed = await api.send<ProfileFieldDetailDto>(
		'toby',
		'PUT',
		path,
		policyBody('Manager', 0, 'Direct'),
		{
			'Idempotency-Key': key,
		},
	)
	expect(narrowed.status).toBe(200)
	expect(narrowed.body).toMatchObject({
		tenantPolicy: { visibility: 'Manager', revision: 1 },
		effectiveVisibility: 'Manager',
	})
	const replay = await api.send<ProfileFieldDetailDto>(
		'toby',
		'PUT',
		path,
		policyBody('Manager', 0, 'Direct'),
		{
			'Idempotency-Key': key,
		},
	)
	expect(replay.body.tenantPolicy?.id).toBe(narrowed.body.tenantPolicy?.id)
	expect(
		(await api.send('toby', 'PUT', path, policyBody('Hr', 0), { 'Idempotency-Key': key })).status,
	).toBe(409)
	expect((await api.send('toby', 'PUT', path, policyBody('Hr', 0))).status).toBe(409)
	const widened = await api.send<{ code: string; fieldErrors: { field: string }[] }>(
		'toby',
		'PUT',
		`${base}/profile-fields/${encodeURIComponent('standard:birth-date')}/tenant-policy/WorkforceActivation`,
		policyBody('Organization', 0, 'Direct'),
	)
	expect(widened.status).toBe(400)
	expect(widened.body.code).toBe('visibility-ceiling-exceeded')
	expect(widened.body.fieldErrors.map(/** Field. */ (e) => e.field)).toEqual([
		'visibility',
		'selfEditMode',
	])
	const second = await api.send<ProfileFieldDetailDto>(
		'toby',
		'PUT',
		path,
		policyBody('Hr', 1, 'Direct'),
	)
	expect(second.body).toMatchObject({
		tenantPolicy: { visibility: 'Hr', revision: 2 },
		policyRevision: 2,
	})
	const history = await api.admin.query(
		"SELECT visibility,effective_until_at IS NOT NULL AS closed,superseded_by_id IS NOT NULL AS linked FROM hcm.profile_field_tenant_policy WHERE standard_field_code='preferred-name' ORDER BY revision",
	)
	expect(history.rows).toEqual([
		{ visibility: 'Manager', closed: true, linked: true },
		{ visibility: 'Hr', closed: false, linked: false },
	])
	const reset = await api.send<ProfileFieldDetailDto>('toby', 'POST', `${path}/reset`, {
		expectedRevision: 2,
		reason: 'Back to product default',
	})
	expect(reset.status).toBe(200)
	expect(reset.body).toMatchObject({
		tenantPolicy: null,
		policyRevision: 0,
		effectiveVisibility: 'Organization',
	})
	expect(
		(await api.send('toby', 'POST', `${path}/reset`, { expectedRevision: 2, reason: 'Again' }))
			.status,
	).toBe(409)
	const audit = await api.admin.query(
		"SELECT action,safe_summary->'changedFields' AS fields FROM hcm.audit_event WHERE target_id='standard:preferred-name' ORDER BY occurred_at,id",
	)
	expect(audit.rows).toEqual([
		{ action: 'employee.profile-policy-changed', fields: ['visibility', 'allowWorkerPreference'] },
		{ action: 'employee.profile-policy-changed', fields: ['visibility'] },
		{ action: 'employee.profile-policy-reset', fields: ['tenantPolicy'] },
	])
	expect(
		(
			await api.send(
				'toby',
				'PUT',
				`${base}/profile-fields/${encodeURIComponent('standard:preferred-name')}/tenant-policy/Payroll`,
				policyBody('Hr', 0),
			)
		).status,
	).toBe(400)
})

it('defines custom fields, maintains options and retires without delete', /** REQ-003 and REQ-004. */ async () => {
	const created = await api.send<ProfileFieldDetailDto>('toby', 'POST', `${base}/custom-fields`, {
		code: 'TSHIRT_SIZE',
		name: 'T-shirt size',
		description: 'For company events',
		ownerScope: 'Worker',
		dataType: 'SingleSelect',
		sensitivity: 'Personal',
		section: 'Other',
		searchable: false,
		options: [
			{ code: 'S', name: 'Small' },
			{ code: 'M', name: 'Medium', sortOrder: 1 },
		],
		reason: 'Event planning',
	})
	expect(created.status).toBe(201)
	expect(created.body).toMatchObject({
		custom: true,
		ceiling: 'Manager',
		effectiveVisibility: 'Manager',
		hasValues: false,
		customField: {
			code: 'TSHIRT_SIZE',
			ownerScope: 'Worker',
			dataType: 'SingleSelect',
			revision: 1,
		},
	})
	const field = created.body.customField as CustomFieldDefinitionDto
	expect(field.options.map(/** Code. */ (option) => option.code)).toEqual(['S', 'M'])
	for (const invalid of [
		{ searchable: true },
		{ options: [] },
		{
			options: [
				{ code: 'S', name: 'Small' },
				{ code: 'S', name: 'Again' },
			],
		},
		{ dataType: 'Text' },
	])
		expect(
			(
				await api.send('toby', 'POST', `${base}/custom-fields`, {
					code: 'OTHER_FIELD',
					name: 'Other',
					ownerScope: 'Worker',
					dataType: 'SingleSelect',
					sensitivity: 'Personal',
					section: 'Other',
					searchable: false,
					options: [{ code: 'A', name: 'A' }],
					reason: 'Try',
					...invalid,
				})
			).status,
		).toBe(400)
	expect(
		(
			await api.send('toby', 'POST', `${base}/custom-fields`, {
				code: 'TSHIRT_SIZE',
				name: 'Duplicate',
				ownerScope: 'Person',
				dataType: 'Text',
				sensitivity: 'DirectorySafe',
				section: 'Other',
				searchable: true,
				reason: 'Duplicate',
			})
		).status,
	).toBe(409)
	const added = await api.send<ProfileFieldDetailDto>(
		'toby',
		'POST',
		`${base}/custom-fields/${field.id}/options`,
		{
			code: 'L',
			name: 'Large',
			sortOrder: 2,
			expectedRevision: 1,
			reason: 'More sizes',
		},
	)
	expect(added.status).toBe(201)
	expect(added.body.customField?.revision).toBe(2)
	expect(
		(
			await api.send('toby', 'POST', `${base}/custom-fields/${field.id}/options`, {
				code: 'L',
				name: 'Large again',
				sortOrder: 3,
				expectedRevision: 2,
				reason: 'Duplicate option',
			})
		).status,
	).toBe(409)
	const small = field.options[0] as CustomFieldOptionDto
	const retiredOption = await api.send<ProfileFieldDetailDto>(
		'toby',
		'PUT',
		`${base}/custom-fields/${field.id}/options/${small.id}`,
		{ name: 'Small', sortOrder: 0, active: false, expectedRevision: 2, reason: 'Not ordered' },
	)
	expect(
		retiredOption.body.customField?.options.find(/** Small. */ (o) => o.code === 'S')?.active,
	).toBe(false)
	const retired = await api.send<ProfileFieldDetailDto>(
		'toby',
		'PUT',
		`${base}/custom-fields/${field.id}`,
		{
			name: 'T-shirt size',
			description: 'For company events',
			section: 'Other',
			sortOrder: 5,
			active: false,
			expectedRevision: 3,
			reason: 'Events paused',
		},
	)
	expect(retired.body).toMatchObject({ active: false, effectiveVisibility: null })
	expect(
		retired.body.preview.every(/** Nobody sees a retired field. */ (entry) => !entry.visible),
	).toBe(true)
	expect(
		(
			await api.send('toby', 'PUT', `${base}/custom-fields/${field.id}`, {
				...retired.body,
				reason: 'x',
			})
		).status,
	).toBe(400)
	for (const method of ['DELETE'])
		for (const path of [
			`${base}/custom-fields/${field.id}`,
			`${base}/custom-fields/${field.id}/options/${small.id}`,
		])
			expect([404, 405]).toContain((await api.send('toby', method, path)).status)
	const narrowCustom = await api.send<{ code: string }>(
		'toby',
		'PUT',
		`${base}/profile-fields/${encodeURIComponent('custom:' + field.id)}/tenant-policy/WorkforceActivation`,
		policyBody('Organization', 0),
	)
	expect(narrowCustom.body.code).toBe('visibility-ceiling-exceeded')
	const audit = await api.admin.query(
		'SELECT action FROM hcm.audit_event WHERE target_id=$1 ORDER BY occurred_at,id',
		['custom:' + field.id],
	)
	expect(audit.rows.map(/** Action. */ (row) => row.action)).toEqual([
		'employee.custom-field-created',
		'employee.custom-field-option-added',
		'employee.custom-field-option-updated',
		'employee.custom-field-retired',
	])
})

it('authorizes reads and writes independently of navigation', /** REQ-006. */ async () => {
	for (const persona of ['jim', 'michael'])
		expect((await api.send(persona, 'GET', `${base}/profile-fields`)).status).toBe(403)
	expect(
		(
			await api.send(
				'david',
				'PUT',
				`${base}/profile-fields/${encodeURIComponent('standard:work-mode')}/tenant-policy/WorkforceActivation`,
				policyBody('Hr', 1),
			)
		).status,
	).toBe(403)
	await api.admin.query("UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.employee'")
	try {
		expect((await api.send('toby', 'GET', `${base}/profile-fields`)).status).toBe(403)
	} finally {
		await api.admin.query(
			"UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.employee'",
		)
	}
	await api.admin.query(
		"UPDATE hcm.user_account SET enabled=false WHERE id='dunder-mifflin/account/toby'",
	)
	try {
		expect([401, 403]).toContain((await api.send('toby', 'GET', `${base}/profile-fields`)).status)
	} finally {
		await api.admin.query(
			"UPDATE hcm.user_account SET enabled=true WHERE id='dunder-mifflin/account/toby'",
		)
	}
	const foreign = 'foreign-configuration'
	await api.admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [foreign])
	try {
		await api.admin.query(
			"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES($1,$1,'Foreign','active')",
			[foreign],
		)
		await api.admin.query(
			"INSERT INTO hcm.custom_field_definition(tenant_id,id,code,name,owner_scope,data_type,sensitivity,section_code) VALUES ($1,'foreign-cf','FOREIGN','Foreign','Person','Text','DirectorySafe','Other')",
			[foreign],
		)
	} finally {
		await api.admin.query("SELECT set_config('hcm.tenant_id','local-dunder-mifflin',false)")
	}
	expect((await detail('toby', 'custom:foreign-cf')).status).toBe(404)
	const { body } = await api.send<ProfileFieldList>('toby', 'GET', `${base}/profile-fields`)
	expect(body.items.map(/** Refs. */ (item) => item.ref)).not.toContain('custom:foreign-cf')
})
