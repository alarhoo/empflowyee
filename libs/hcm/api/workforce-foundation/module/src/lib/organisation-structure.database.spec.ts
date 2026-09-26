import { afterAll, beforeAll, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { StructurePage, UnitDetailDto } from '@empflowyee/hcm-workforce-foundation-contract'
import { HcmWorkforceFoundationModule } from './hcm-api-workforce-foundation-module'
import { startHcmTestApi, type HcmTestApi } from './hcm2-test-harness'

let api: HcmTestApi
const base = 'workforce-foundation/structure'
const company = 'dunder-mifflin/organisation/company'
const scranton = 'dunder-mifflin/organisation/scranton'
const branchType = 'dunder-mifflin/unit-type/branch'

beforeAll(
	/** Start the real module over the seeded disposable database. */ async () => {
		api = await startHcmTestApi(HcmWorkforceFoundationModule)
	},
)
afterAll(
	/** Release the application and connections. */ async () => {
		await api?.close()
	},
)

it('reads seeded structure for granted HR and administrators only', /** Business permissions, not discovery or reporting, authorize reads. */ async () => {
	const roots = await api.send<StructurePage>('david', 'GET', `${base}/units`)
	expect(roots.status).toBe(200)
	expect(roots.cache).toBe('no-store')
	expect(roots.body.items.map(/** Root identity. */ (item) => item.id)).toEqual([company])
	const children = await api.send<StructurePage>(
		'toby',
		'GET',
		`${base}/units?parentId=${encodeURIComponent(company)}`,
	)
	expect(
		children.body.items.map(/** Child names. */ (item) => (item as { name: string }).name),
	).toEqual(['New York Headquarters', 'Scranton Branch'])
	expect((children.body.items[0] as UnitDetailDto).legalEntityInherited).toBe(true)
	const profile = await api.send<{
		organisationName: string
		profile: { defaultTimeZone: string }
	}>('toby', 'GET', `${base}/organisation-profile`)
	expect(profile.body.organisationName).toBe('Dunder Mifflin')
	expect(profile.body.profile.defaultTimeZone).toBe('America/New_York')
	for (const persona of ['jim', 'michael'])
		expect((await api.send(persona, 'GET', `${base}/departments`)).status).toBe(403)
	expect(
		(
			await api.send('toby', 'POST', `${base}/departments`, {
				code: 'X_Y',
				name: 'X',
				description: '',
				parentId: null,
				headWorkerId: null,
				costCenterCode: '',
				targetHeadcount: null,
				sortOrder: 0,
				reason: 'r',
			})
		).status,
	).toBe(403)
})

it('creates structure idempotently and rejects duplicates, stale revisions and cycles', /** Codes are immutable and unique; hierarchies stay acyclic. */ async () => {
	const key = randomUUID()
	const body = {
		code: 'WAREHOUSE',
		name: 'Warehouse',
		description: '',
		parentId: null,
		headWorkerId: null,
		costCenterCode: 'CC-600',
		targetHeadcount: 2,
		sortOrder: 6,
		reason: 'Warehouse team',
	}
	const first = await api.send<{ id: string; revision: number }>(
		'david',
		'POST',
		`${base}/departments`,
		body,
		{ 'idempotency-key': key },
	)
	expect(first.status).toBe(201)
	const replay = await api.send<{ id: string }>('david', 'POST', `${base}/departments`, body, {
		'idempotency-key': key,
	})
	expect(replay.body.id).toBe(first.body.id)
	expect(
		(
			await api.send(
				'david',
				'POST',
				`${base}/departments`,
				{ ...body, name: 'Other' },
				{ 'idempotency-key': key },
			)
		).status,
	).toBe(409)
	const duplicate = await api.send<{ code: string }>('david', 'POST', `${base}/departments`, body)
	expect([duplicate.status, duplicate.body.code]).toEqual([409, 'duplicate-code'])
	const child = await api.send<{ id: string; revision: number }>(
		'david',
		'POST',
		`${base}/departments`,
		{ ...body, code: 'WAREHOUSE_NIGHT', name: 'Night shift', parentId: first.body.id },
	)
	expect(child.status).toBe(201)
	const cycle = await api.send<{ code: string; fieldErrors: { field: string; code: string }[] }>(
		'david',
		'PUT',
		`${base}/departments/${first.body.id}`,
		{
			name: 'Warehouse',
			description: '',
			parentId: child.body.id,
			headWorkerId: null,
			costCenterCode: '',
			targetHeadcount: null,
			sortOrder: 6,
			expectedRevision: first.body.revision,
			reason: 'Loop',
		},
	)
	expect([cycle.status, cycle.body.fieldErrors[0]]).toEqual([
		400,
		{ field: 'parentId', code: 'cycle' },
	])
	const stale = await api.send<{ code: string }>(
		'david',
		'PUT',
		`${base}/departments/${first.body.id}`,
		{
			name: 'Renamed',
			description: '',
			parentId: null,
			headWorkerId: null,
			costCenterCode: '',
			targetHeadcount: null,
			sortOrder: 6,
			expectedRevision: first.body.revision + 5,
			reason: 'Stale',
		},
	)
	expect([stale.status, stale.body.code]).toEqual([409, 'revision-conflict'])
	const blocked = await api.send<{ code: string }>(
		'david',
		'POST',
		`${base}/departments/${first.body.id}/active`,
		{ active: false, expectedRevision: first.body.revision, reason: 'Close' },
	)
	expect([blocked.status, blocked.body.code]).toEqual([409, 'structure-in-use'])
	const audit = await api.admin.query(
		"SELECT target_type,safe_summary FROM hcm.audit_event WHERE action='workforce.structure-created' AND target_id=$1",
		[first.body.id],
	)
	expect(audit.rows[0].target_type).toBe('department')
	expect(audit.rows[0].safe_summary.changedFields).toContain('costCenterCode')
	expect(JSON.stringify(audit.rows[0].safe_summary)).not.toContain('CC-600')
})

it('enforces the unit type chain and effective-dated versions', /** Units follow the configured levels; versions never overlap. */ async () => {
	const unit = {
		unitTypeId: branchType,
		parentId: company,
		name: 'Stamford Branch',
		description: '',
		legalEntityId: null,
		primaryLocationId: null,
		costCenterCode: 'CC-130',
		headWorkerId: null,
		effectiveFrom: '2026-01-01',
		reason: 'Open Stamford',
	}
	const created = await api.send<UnitDetailDto>('david', 'POST', `${base}/units`, {
		code: 'stamford',
		...unit,
	})
	expect(created.status).toBe(201)
	expect(created.body.versions).toHaveLength(1)
	const orphan = await api.send<{ fieldErrors: { code: string }[] }>(
		'david',
		'POST',
		`${base}/units`,
		{ code: 'orphan', ...unit, parentId: null },
	)
	expect([orphan.status, orphan.body.fieldErrors[0].code]).toEqual([400, 'type-chain'])
	const bearing = await api.send<{ fieldErrors: { code: string }[] }>(
		'david',
		'POST',
		`${base}/units`,
		{ code: 'bearing', ...unit, legalEntityId: 'dunder-mifflin/legal-entity/dmpc' },
	)
	expect(bearing.body.fieldErrors[0].code).toBe('bearing-level')
	const renamed = await api.send<UnitDetailDto>(
		'david',
		'POST',
		`${base}/units/${created.body.id}/versions`,
		{
			...unit,
			name: 'Stamford Office',
			effectiveFrom: '2026-06-01',
			expectedRevision: created.body.revision,
			reason: 'Rename',
		},
	)
	expect(renamed.status).toBe(200)
	expect(
		renamed.body.versions.map(/** Dated range. */ (v) => [v.name, v.effectiveFrom, v.effectiveTo]),
	).toEqual([
		['Stamford Office', '2026-06-01', null],
		['Stamford Branch', '2026-01-01', '2026-05-31'],
	])
	const overlap = await api.send<{ code: string }>(
		'david',
		'POST',
		`${base}/units/${created.body.id}/versions`,
		{
			...unit,
			effectiveFrom: '2026-03-01',
			expectedRevision: renamed.body.revision,
			reason: 'Backdate',
		},
	)
	expect([overlap.status, overlap.body.code]).toEqual([409, 'overlapping-effective-period'])
	const inUse = await api.send<{ code: string }>(
		'david',
		'POST',
		`${base}/units/${encodeURIComponent(scranton)}/retire`,
		{ effectiveTo: '2026-12-31', successorId: null, expectedRevision: 1, reason: 'Close' },
	)
	expect([inUse.status, inUse.body.code]).toEqual([409, 'structure-in-use'])
	const retired = await api.send<UnitDetailDto>(
		'david',
		'POST',
		`${base}/units/${created.body.id}/retire`,
		{
			effectiveTo: '2026-12-31',
			successorId: scranton,
			expectedRevision: renamed.body.revision,
			reason: 'Merged into Scranton',
		},
	)
	expect([retired.status, retired.body.active, retired.body.supersededBy?.id]).toEqual([
		200,
		false,
		scranton,
	])
})

it('maintains organisation defaults under revision and hides other tenants', /** RLS and explicit predicates both hide foreign rows. */ async () => {
	const current = await api.send<{ profile: { revision: number } }>(
		'david',
		'GET',
		`${base}/organisation-profile`,
	)
	const saved = await api.send<{ profile: { defaultLanguage: string; revision: number } }>(
		'david',
		'PUT',
		`${base}/organisation-profile`,
		{
			defaultTimeZone: 'America/New_York',
			defaultLanguage: 'en-US',
			defaultCurrencyCode: 'USD',
			financialYearStartMonth: 4,
			financialYearStartDay: 1,
			headquartersLocationId: 'dunder-mifflin/location/new-york',
			expectedRevision: current.body.profile.revision,
			reason: 'Fiscal year change',
		},
	)
	expect(saved.status).toBe(200)
	expect(saved.body.profile.revision).toBe(current.body.profile.revision + 1)
	const invalid = await api.send<{ fieldErrors: { field: string }[] }>(
		'david',
		'PUT',
		`${base}/organisation-profile`,
		{
			defaultTimeZone: 'Mars/Olympus',
			defaultLanguage: 'en-US',
			defaultCurrencyCode: 'USD',
			financialYearStartMonth: 2,
			financialYearStartDay: 30,
			headquartersLocationId: null,
			expectedRevision: 2,
			reason: 'x',
		},
	)
	expect(invalid.status).toBe(400)
	const foreign = 'foreign-structure'
	await api.admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [foreign])
	await api.admin.query(
		"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES($1,$1,'Foreign','active')",
		[foreign],
	)
	await api.admin.query(
		"INSERT INTO hcm.department(tenant_id,id,code,name) VALUES($1,'foreign-dept','FOREIGN','Foreign')",
		[foreign],
	)
	await api.admin.query("SELECT set_config('hcm.tenant_id','local-dunder-mifflin',false)")
	expect((await api.send('david', 'GET', `${base}/departments/foreign-dept`)).status).toBe(404)
	const list = await api.send<StructurePage>('david', 'GET', `${base}/departments?q=Foreign`)
	expect(list.body.items).toEqual([])
})
