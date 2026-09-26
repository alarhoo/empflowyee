import { afterAll, beforeAll, expect, it } from 'vitest'
import type {
	IdentificationTypeList,
	ReferenceItemPage,
} from '@empflowyee/hcm-workforce-foundation-contract'
import { HcmWorkforceFoundationModule } from './hcm-api-workforce-foundation-module'
import { startHcmTestApi, type HcmTestApi } from './hcm2-test-harness'

let api: HcmTestApi
const base = 'workforce-foundation/identification-types'
const permission = 'hcm.workforce-foundation.identification-types.read'

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

it('lists the product catalogue for granted HR and administrators without raw patterns or values', /** REQ-001 and REQ-003: every product row with safe characteristics only. */ async () => {
	for (const persona of ['david', 'toby']) {
		const reply = await api.send<IdentificationTypeList>(persona, 'GET', base)
		expect(reply.status).toBe(200)
		expect(reply.cache).toBe('no-store')
		expect(
			reply.body.items.map(/** Catalogue order is name then code. */ (item) => item.code),
		).toEqual(['AADHAAR', 'DRIVING_LICENCE', 'NI_NUMBER', 'PASSPORT', 'PAN', 'SSN', 'UAN'])
	}
	const { body } = await api.send<IdentificationTypeList>('toby', 'GET', base)
	expect(body.items.find(/** Masked US identifier. */ (item) => item.code === 'SSN')).toEqual({
		code: 'SSN',
		name: 'Social Security Number',
		countryCode: 'US',
		validationDescription: 'Nine digits, optionally grouped 3-2-4',
		uniquePerPerson: true,
		requiresMasking: true,
		requiredForPayroll: true,
		active: true,
	})
	expect(
		body.items.find(/** Issued by any country. */ (item) => item.code === 'PASSPORT')?.countryCode,
	).toBeNull()
	const serialized = JSON.stringify(body)
	for (const forbidden of ['validationPattern', 'validation_pattern', '^[', 'value', 'person'])
		expect(serialized).not.toContain(forbidden)
	expect((await api.send('toby', 'GET', `${base}?q=pan`)).status).toBe(400)
})

it('keeps retired product types visible as inactive', /** REQ-001: retirement is a product migration, never deletion. */ async () => {
	await api.admin.query("UPDATE hcm.identification_type SET active=false WHERE code='UAN'")
	try {
		const { body } = await api.send<IdentificationTypeList>('david', 'GET', base)
		expect(body.items.find(/** Retired type. */ (item) => item.code === 'UAN')?.active).toBe(false)
	} finally {
		await api.admin.query("UPDATE hcm.identification_type SET active=true WHERE code='UAN'")
	}
})

it('pages issuing countries for the country filter', /** Only countries that issue a type are offered. */ async () => {
	const all = await api.send<ReferenceItemPage>('toby', 'GET', `${base}/options/countries`)
	expect(all.status).toBe(200)
	expect(all.body.items.map(/** Country identity. */ (item) => item.code)).toEqual([
		'IN',
		'GB',
		'US',
	])
	const page = await api.send<ReferenceItemPage>('toby', 'GET', `${base}/options/countries?limit=2`)
	expect(page.body.items).toHaveLength(2)
	expect(page.body.nextCursor).not.toBeNull()
	const next = await api.send<ReferenceItemPage>(
		'toby',
		'GET',
		`${base}/options/countries?limit=2&cursor=${encodeURIComponent(page.body.nextCursor ?? '')}`,
	)
	expect(next.body.items.map(/** Remaining country. */ (item) => item.code)).toEqual(['US'])
	const search = await api.send<ReferenceItemPage>(
		'toby',
		'GET',
		`${base}/options/countries?q=united`,
	)
	expect(search.body.items.map(/** Matches. */ (item) => item.code)).toEqual(['GB', 'US'])
	const replayed = await api.send(
		'david',
		'GET',
		`${base}/options/countries?limit=2&cursor=${encodeURIComponent(page.body.nextCursor ?? '')}`,
	)
	expect(replayed.status).toBe(400)
})

it('offers no tenant mutation and gives the runtime role read-only access', /** REQ-002: the catalogue stays product-owned (DEC-HCM2-016). */ async () => {
	for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
		for (const path of [base, `${base}/PAN`])
			expect([404, 405]).toContain(
				(await api.send('david', method, path, { code: 'NEW_TYPE', name: 'New' })).status,
			)
	const privileges = await api.admin.query<{ privilege: string; granted: boolean }>(
		"SELECT p AS privilege, has_table_privilege('hcm_runtime','hcm.identification_type',p) AS granted FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p",
	)
	expect(privileges.rows).toEqual([
		{ privilege: 'SELECT', granted: true },
		{ privilege: 'INSERT', granted: false },
		{ privilege: 'UPDATE', granted: false },
		{ privilege: 'DELETE', granted: false },
		{ privilege: 'TRUNCATE', granted: false },
	])
	const permissions = await api.admin.query(
		"SELECT code FROM hcm.access_permission WHERE code LIKE 'hcm.workforce-foundation.identification-types.%'",
	)
	expect(permissions.rows).toEqual([{ code: permission }])
})

it('authorizes every read independently of navigation', /** REQ-004: grant, entitlement and enabled actor are each rechecked. */ async () => {
	for (const persona of ['jim', 'michael'])
		for (const path of [base, `${base}/options/countries`])
			expect((await api.send(persona, 'GET', path)).status).toBe(403)
	await api.admin.query(
		"DELETE FROM hcm.role_permission WHERE role_id='hr-specialist' AND permission_code=$1",
		[permission],
	)
	try {
		expect((await api.send('toby', 'GET', base)).status).toBe(403)
	} finally {
		await api.admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES('local-dunder-mifflin','hr-specialist',$1)",
			[permission],
		)
	}
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
		"UPDATE hcm.user_account SET enabled=false WHERE id='dunder-mifflin/account/toby'",
	)
	try {
		expect([401, 403]).toContain((await api.send('toby', 'GET', base)).status)
	} finally {
		await api.admin.query(
			"UPDATE hcm.user_account SET enabled=true WHERE id='dunder-mifflin/account/toby'",
		)
	}
	expect((await api.send('toby', 'GET', base)).status).toBe(200)
})
