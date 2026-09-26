import { afterAll, beforeAll, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type {
	LookupSetDto,
	LookupValueDto,
	LookupValuePage,
} from '@empflowyee/hcm-workforce-foundation-contract'
import { HcmWorkforceFoundationModule } from './hcm-api-workforce-foundation-module'
import { startHcmTestApi, type HcmTestApi } from './hcm2-test-harness'

let api: HcmTestApi
const base = 'workforce-foundation/lookup-sets'

beforeAll(
	/** Start the real module over the migrated and seeded disposable database. */ async () => {
		api = await startHcmTestApi(HcmWorkforceFoundationModule)
	},
)
afterAll(
	/** Release the application and connections. */ async () => {
		await api?.close()
	},
)

/** A valid worker-type create body. */
function workerType(code: string) {
	return {
		code,
		name: 'Associate',
		description: 'Customer term for employees',
		sortOrder: 4,
		attributes: { statutoryClass: 'Employee', payrollEligible: true, benefitEligible: false },
		reason: 'Add the customer term',
	}
}

it('lists the eight sets and pages values from PostgreSQL for HR and administrators', /** REQ-001: sets with ownership and counts, values sorted by order then name. */ async () => {
	for (const persona of ['david', 'toby']) {
		const sets = await api.send<{ items: LookupSetDto[] }>(persona, 'GET', base)
		expect(sets.status).toBe(200)
		expect(sets.cache).toBe('no-store')
		expect(
			sets.body.items.map(
				/** Key and ownership. */ (set) => [set.key, set.ownership, set.itemCount],
			),
		).toEqual([
			['worker-types', 'Tenant', 3],
			['employment-end-reasons', 'Tenant', 7],
			['worker-event-types', 'Tenant', 9],
			['genders', 'Product', 4],
			['marital-statuses', 'Product', 4],
			['relationship-types', 'Product', expect.any(Number)],
			['countries', 'Product', expect.any(Number)],
			['currencies', 'Product', expect.any(Number)],
		])
	}
	const types = await api.send<LookupValuePage>('toby', 'GET', `${base}/worker-types/values`)
	expect(types.body.items.map(/** Codes in order. */ (item) => item.code)).toEqual([
		'EMPLOYEE',
		'CONTRACTOR',
		'INTERN',
	])
	expect(types.body.items[0]).toMatchObject({
		name: 'Employee',
		active: true,
		sortOrder: 1,
		revision: 1,
		attributes: { statutoryClass: 'Employee', payrollEligible: true, benefitEligible: true },
	})
	const page = await api.send<LookupValuePage>('toby', 'GET', `${base}/countries/values?limit=2`)
	expect(page.body.items).toHaveLength(2)
	const next = await api.send<LookupValuePage>(
		'toby',
		'GET',
		`${base}/countries/values?limit=2&cursor=${encodeURIComponent(page.body.nextCursor ?? '')}`,
	)
	expect(next.body.items[0]?.code).not.toBe(page.body.items[1]?.code)
	const search = await api.send<LookupValuePage>('toby', 'GET', `${base}/countries/values?q=gb`)
	expect(search.body.items.map(/** Code or name matches. */ (item) => item.code)).toContain('GB')
	expect((await api.send('toby', 'GET', `${base}?q=x`)).status).toBe(400)
	expect((await api.send('toby', 'GET', `${base}/unknown/values`)).status).toBe(400)
})

it('creates, edits, retires and reactivates tenant values with idempotent audited commands', /** REQ-002, REQ-003, REQ-007. */ async () => {
	const key = randomUUID()
	const created = await api.send<LookupValueDto>(
		'david',
		'POST',
		`${base}/worker-types/values`,
		workerType('ASSOCIATE'),
		{ 'Idempotency-Key': key },
	)
	expect(created.status).toBe(201)
	expect(created.body).toMatchObject({ code: 'ASSOCIATE', revision: 1, active: true })
	const replay = await api.send<LookupValueDto>(
		'david',
		'POST',
		`${base}/worker-types/values`,
		workerType('ASSOCIATE'),
		{ 'Idempotency-Key': key },
	)
	expect(replay.body.id).toBe(created.body.id)
	expect(
		(
			await api.send('david', 'POST', `${base}/worker-types/values`, workerType('OTHER'), {
				'Idempotency-Key': key,
			})
		).status,
	).toBe(409)
	expect(
		(await api.send('david', 'POST', `${base}/worker-types/values`, workerType('ASSOCIATE')))
			.status,
	).toBe(409)
	expect(
		(await api.send('david', 'POST', `${base}/worker-types/values`, workerType('lower'))).status,
	).toBe(400)
	expect(
		(
			await api.send('david', 'POST', `${base}/worker-types/values`, {
				...workerType('EXTRA'),
				attributes: { ...workerType('EXTRA').attributes, grade: 'G1' },
			})
		).status,
	).toBe(400)
	const id = created.body.id
	const edit = {
		name: 'Associate employee',
		description: '',
		sortOrder: 5,
		attributes: { statutoryClass: 'Contractor', payrollEligible: false, benefitEligible: false },
		expectedRevision: 1,
		reason: 'Clarify the term',
	}
	const updated = await api.send<LookupValueDto>(
		'david',
		'PUT',
		`${base}/worker-types/values/${id}`,
		edit,
	)
	expect(updated.status).toBe(200)
	expect(updated.body).toMatchObject({
		code: 'ASSOCIATE',
		name: 'Associate employee',
		revision: 2,
		attributes: { statutoryClass: 'Contractor' },
	})
	expect(
		(await api.send('david', 'PUT', `${base}/worker-types/values/${id}`, { ...edit, code: 'NEW' }))
			.status,
	).toBe(400)
	expect((await api.send('david', 'PUT', `${base}/worker-types/values/${id}`, edit)).status).toBe(
		409,
	)
	const retired = await api.send<LookupValueDto>(
		'david',
		'POST',
		`${base}/worker-types/values/${id}/active`,
		{ active: false, expectedRevision: 2, reason: 'No longer used' },
	)
	expect(retired.body).toMatchObject({ active: false, revision: 3 })
	const inactive = await api.send<LookupValuePage>(
		'toby',
		'GET',
		`${base}/worker-types/values?active=false`,
	)
	expect(inactive.body.items.map(/** Retired codes. */ (item) => item.code)).toEqual(['ASSOCIATE'])
	const reactivated = await api.send<LookupValueDto>(
		'david',
		'POST',
		`${base}/worker-types/values/${id}/active`,
		{ active: true, expectedRevision: 3, reason: 'Back in use' },
	)
	expect(reactivated.body.active).toBe(true)
	const audit = await api.admin.query(
		"SELECT action,safe_summary->'changedFields' AS fields FROM hcm.audit_event WHERE target_id=$1 ORDER BY occurred_at,id",
		[id],
	)
	expect(audit.rows.map(/** Actions. */ (row) => row.action)).toEqual([
		'workforce.lookup-created',
		'workforce.lookup-updated',
		'workforce.lookup-retired',
		'workforce.lookup-activated',
	])
	expect(audit.rows[1].fields).toEqual(['name', 'description', 'sortOrder', 'attributes'])
	const eventType = await api.send<LookupValueDto>(
		'david',
		'POST',
		`${base}/worker-event-types/values`,
		{
			code: 'SECONDED',
			name: 'Seconded',
			description: '',
			sortOrder: 10,
			attributes: { category: 'Transfer' },
			reason: 'Track secondments',
		},
	)
	expect(eventType.body.attributes).toEqual({ category: 'Transfer', requiresApproval: false })
	expect(
		(
			await api.send('david', 'POST', `${base}/worker-event-types/values`, {
				code: 'APPROVED',
				name: 'Approved',
				description: '',
				sortOrder: 11,
				attributes: { category: 'Other', requiresApproval: true },
				reason: 'Try to set approval',
			})
		).status,
	).toBe(400)
})

it('keeps product sets read-only and offers no delete', /** REQ-003 and REQ-004. */ async () => {
	const product = await api.send<{ code: string }>('david', 'POST', `${base}/genders/values`, {
		code: 'OTHER_X',
		name: 'Other',
		description: '',
		sortOrder: 9,
		attributes: {},
		reason: 'Try product',
	})
	expect(product.status).toBe(400)
	expect(product.body.code).toBe('set-not-editable')
	expect(
		(
			await api.send('david', 'POST', `${base}/genders/values/FEMALE/active`, {
				active: false,
				expectedRevision: 1,
				reason: 'Try',
			})
		).body,
	).toMatchObject({ code: 'set-not-editable' })
	expect([404, 405]).toContain(
		(
			await api.send(
				'david',
				'DELETE',
				`${base}/worker-types/values/${'dunder-mifflin/worker-type/intern'}`,
			)
		).status,
	)
	const grants = await api.admin.query(
		"SELECT t, has_table_privilege('hcm_runtime','hcm.'||t,'INSERT') AS insert, has_table_privilege('hcm_runtime','hcm.'||t,'DELETE') AS delete FROM unnest(ARRAY['gender','marital_status','relationship_type','country','currency','worker_type','employment_end_reason','worker_event_type']) t",
	)
	for (const row of grants.rows) {
		expect(row.delete).toBe(false)
		expect(row.insert).toBe(
			['worker_type', 'employment_end_reason', 'worker_event_type'].includes(row.t),
		)
	}
	const code = await api.admin.query(
		"SELECT has_column_privilege('hcm_runtime','hcm.worker_type','code','UPDATE') AS update",
	)
	expect(code.rows[0].update).toBe(false)
})

it('authorizes reads and writes independently of navigation', /** REQ-005: grant, entitlement, enabled actor and tenant. */ async () => {
	for (const persona of ['jim', 'michael'])
		expect((await api.send(persona, 'GET', base)).status).toBe(403)
	expect(
		(await api.send('toby', 'POST', `${base}/worker-types/values`, workerType('TOBY_TYPE'))).status,
	).toBe(403)
	await api.admin.query(
		"UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.workforce-foundation'",
	)
	try {
		expect((await api.send('david', 'GET', base)).status).toBe(403)
	} finally {
		await api.admin.query(
			"UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.workforce-foundation'",
		)
	}
	await api.admin.query(
		"UPDATE hcm.user_account SET enabled=false WHERE id='dunder-mifflin/account/david'",
	)
	try {
		expect([401, 403]).toContain((await api.send('david', 'GET', base)).status)
	} finally {
		await api.admin.query(
			"UPDATE hcm.user_account SET enabled=true WHERE id='dunder-mifflin/account/david'",
		)
	}
	const foreign = 'foreign-lookups'
	await api.admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [foreign])
	try {
		await api.admin.query(
			"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES($1,$1,'Foreign','active') ON CONFLICT DO NOTHING",
			[foreign],
		)
		await api.admin.query(
			"INSERT INTO hcm.worker_type(tenant_id,id,code,name,statutory_class,is_payroll_eligible,is_benefit_eligible) VALUES($1,'foreign-type','FOREIGN','Foreign','Employee',true,true)",
			[foreign],
		)
	} finally {
		await api.admin.query("SELECT set_config('hcm.tenant_id','local-dunder-mifflin',false)")
	}
	const values = await api.send<LookupValuePage>(
		'david',
		'GET',
		`${base}/worker-types/values?limit=100`,
	)
	expect(values.body.items.map(/** IDs. */ (item) => item.id)).not.toContain('foreign-type')
	expect(
		(
			await api.send('david', 'PUT', `${base}/worker-types/values/foreign-type`, {
				name: 'Stolen',
				description: '',
				sortOrder: 1,
				attributes: { statutoryClass: 'Employee', payrollEligible: true, benefitEligible: true },
				expectedRevision: 1,
				reason: 'Cross-tenant attempt',
			})
		).status,
	).toBe(404)
})
