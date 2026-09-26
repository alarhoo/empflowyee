import { afterAll, beforeAll, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type {
	CatalogueSummaryDto,
	CatalogueVersionDto,
	JobFamilyPage,
	JobProfilePage,
	JobProfileVersionDto,
} from '@empflowyee/hcm-job-architecture-contract'
import { HcmJobArchitectureModule } from './hcm-api-job-architecture-module'
import { startHcmTestApi, type HcmTestApi } from './job-architecture-test-harness'

let api: HcmTestApi
const base = 'job-architecture'
const CATALOGUE = 'dunder-mifflin/job-catalogue'
const V1 = `${CATALOGUE}/v1`
const V2 = `${CATALOGUE}/v2`

beforeAll(
	/** Start the real modules over the migrated and seeded disposable database. */ async () => {
		api = await startHcmTestApi(HcmJobArchitectureModule)
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

/** Read one catalogue version as David. */
async function version(id: string): Promise<CatalogueVersionDto> {
	return (
		await api.send<CatalogueVersionDto>('david', 'GET', `${base}/catalogue-versions/${seg(id)}`)
	).body
}

/** Add an element to version 2 as David at its current revision. */
async function add(kind: string, fields: Record<string, unknown>) {
	const current = await version(V2)
	return api.send<CatalogueVersionDto & { code: string; fieldErrors?: unknown[] }>(
		'david',
		'POST',
		`${base}/catalogue-versions/${seg(V2)}/${kind}`,
		{ ...fields, expectedRevision: current.revision, reason: 'Catalogue review' },
	)
}

/** A draft referencing version 2 elements. */
function draft(overrides: Record<string, unknown> = {}) {
	return {
		catalogueVersionId: V2,
		familyId: `${V2}/families/INSIDE_SALES`,
		trackId: `${V2}/tracks/IC`,
		levelId: `${V2}/levels/IC1`,
		summary: 'Handles inbound paper orders.',
		responsibilities: [{ code: 'ORDERS', statement: 'Process inbound orders.' }],
		requirements: [
			{
				code: 'EXPERIENCE',
				type: 'Experience',
				name: 'Customer service',
				minimumQuantity: 1,
				unit: 'Years',
			},
		],
		allowedGrades: [
			{ gradeId: `${V2}/grades/G1`, isDefault: true },
			{ gradeId: `${V2}/grades/G2`, isDefault: false },
		],
		...overrides,
	}
}

it('lets administrators and HR read the published catalogue and profiles', /** REQ-JOB-CATALOGUE-001, REQ-JOB-CATALOGUE-005. */ async () => {
	for (const persona of ['david', 'toby']) {
		const list = await api.send<{ items: CatalogueSummaryDto[] }>(
			persona,
			'GET',
			`${base}/catalogues`,
		)
		expect(list.status).toBe(200)
		expect(list.cache).toBe('no-store')
		expect(list.body.items).toMatchObject([{ id: CATALOGUE, currentVersionId: V1 }])
	}
	const v1 = await version(V1)
	expect(v1).toMatchObject({ status: 'Published', current: true, familyCount: 6, revision: 1 })
	const roots = await api.send<JobFamilyPage>(
		'toby',
		'GET',
		`${base}/catalogue-versions/${seg(V1)}/families`,
	)
	expect(roots.body.items.map(/** Code. */ (f) => f.code)).toEqual(['SALES', 'CORPORATE_SERVICES'])
	const children = await api.send<JobFamilyPage>(
		'toby',
		'GET',
		`${base}/catalogue-versions/${seg(V1)}/families?parentId=${seg('dunder-mifflin/job-family/v1/SALES')}`,
	)
	expect(children.body.items.map(/** Code. */ (f) => f.code)).toEqual([
		'INSIDE_SALES',
		'ACCOUNT_MANAGEMENT',
	])
	const profiles = await api.send<JobProfilePage>('toby', 'GET', `${base}/profiles?q=rep`)
	expect(profiles.body.items.map(/** Code. */ (p) => p.code)).toEqual([
		'HR_REPRESENTATIVE',
		'SALES_REPRESENTATIVE',
	])
	expect((await api.send('toby', 'GET', `${base}/profiles?status=Unknown`)).status).toBe(400)
	for (const persona of ['jim', 'michael'])
		expect((await api.send(persona, 'GET', `${base}/catalogues`)).status).toBe(403)
	expect(
		(await api.send('david', 'GET', `${base}/catalogue-versions/${seg('foreign/v1')}`)).status,
	).toBe(404)
})

it('maintains a draft successor within the catalogue shape', /** REQ-JOB-CATALOGUE-002. */ async () => {
	expect(
		(
			await api.send('toby', 'POST', `${base}/catalogues/${seg(CATALOGUE)}/versions`, {
				basedOnVersionId: V1,
				changeSummary: 'x',
				reason: 'x',
			})
		).status,
	).toBe(403)
	const created = await api.send<CatalogueVersionDto>(
		'david',
		'POST',
		`${base}/catalogues/${seg(CATALOGUE)}/versions`,
		{
			basedOnVersionId: V1,
			changeSummary: 'Adds a Warehouse family.',
			reason: 'Warehouse staff join the catalogue.',
		},
	)
	expect(created.status).toBe(201)
	expect(created.body).toMatchObject({
		id: V2,
		versionNumber: 2,
		status: 'Draft',
		current: false,
		familyCount: 6,
	})
	expect(
		created.body.bands.flatMap(/** Grades. */ (b) => b.grades.map(/** Code. */ (g) => g.code)),
	).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8'])
	const second = await api.send<{ code: string }>(
		'david',
		'POST',
		`${base}/catalogues/${seg(CATALOGUE)}/versions`,
		{
			basedOnVersionId: V1,
			changeSummary: 'Again',
			reason: 'Again',
		},
	)
	expect(second.status).toBe(409)
	expect(second.body.code).toBe('invalid-state')

	expect((await add('families', { code: 'OPERATIONS', name: 'Operations' })).status).toBe(201)
	const warehouse = await add('families', {
		code: 'WAREHOUSE',
		name: 'Warehouse',
		parentId: `${V2}/families/OPERATIONS`,
	})
	expect(warehouse.status).toBe(201)
	expect(warehouse.body.familyCount).toBe(8)
	const deep = await add('families', {
		code: 'FORKLIFT',
		name: 'Forklift',
		parentId: `${V2}/families/WAREHOUSE`,
	})
	expect(deep.status).toBe(400)
	expect(deep.body.fieldErrors).toEqual([{ field: 'parentId', code: 'too-deep' }])
	expect((await add('families', { code: 'SALES', name: 'Sales again' })).body.fieldErrors).toEqual([
		{ field: 'code', code: 'duplicate' },
	])
	expect((await add('tracks', { code: 'EXPERT', name: 'Expert', kind: 'Specialist' })).status).toBe(
		400,
	)
	expect(
		(await add('tracks', { code: 'IC_TWO', name: 'Second IC', kind: 'IndividualContributor' })).body
			.fieldErrors,
	).toEqual([{ field: 'kind', code: 'duplicate' }])
	expect(
		(
			await add('levels', {
				code: 'IC5',
				name: 'Distinguished',
				trackId: `${V2}/tracks/IC`,
				sequence: 4,
			})
		).body.fieldErrors,
	).toEqual([{ field: 'sequence', code: 'duplicate' }])
	expect(
		(
			await add('levels', {
				code: 'IC5',
				name: 'Distinguished',
				trackId: `${V2}/tracks/IC`,
				sequence: 5,
			})
		).status,
	).toBe(201)

	const draftVersion = await version(V2)
	const retire = await api.send<CatalogueVersionDto>(
		'david',
		'PUT',
		`${base}/catalogue-versions/${seg(V2)}/grades/${seg(`${V2}/grades/G8`)}`,
		{
			name: 'Grade 8',
			sequence: 2,
			active: false,
			expectedRevision: draftVersion.revision,
			reason: 'Unused grade',
		},
	)
	expect(retire.status).toBe(200)
	expect(retire.body.bands[3]?.grades[1]).toMatchObject({ code: 'G8', active: false })
	expect(retire.body.revision).toBe(draftVersion.revision + 1)
	const stale = await api.send(
		'david',
		'PUT',
		`${base}/catalogue-versions/${seg(V2)}/grades/${seg(`${V2}/grades/G8`)}`,
		{
			name: 'Grade 8',
			sequence: 2,
			active: true,
			expectedRevision: draftVersion.revision,
			reason: 'Stale',
		},
	)
	expect(stale.status).toBe(409)
	const published = await api.send<{ code: string }>(
		'david',
		'POST',
		`${base}/catalogue-versions/${seg(V1)}/bands`,
		{ code: 'EXTRA', name: 'Extra', sequence: 9, expectedRevision: 1, reason: 'Edit published' },
	)
	expect(published.status).toBe(409)
	expect(published.body.code).toBe('version-published')
})

it('submits and publishes, closing the previous version and keeping existing profiles', /** REQ-JOB-CATALOGUE-004. */ async () => {
	const draftVersion = await version(V2)
	const submitted = await api.send<CatalogueVersionDto>(
		'david',
		'POST',
		`${base}/catalogue-versions/${seg(V2)}/submit`,
		{
			expectedRevision: draftVersion.revision,
			reason: 'Ready for review',
		},
	)
	expect(submitted.status).toBe(200)
	expect(submitted.body.status).toBe('InReview')
	expect((await add('bands', { code: 'EXTRA', name: 'Extra', sequence: 9 })).status).toBe(409)
	const early = await api.send<{ fieldErrors: unknown[] }>(
		'david',
		'POST',
		`${base}/catalogue-versions/${seg(V2)}/publish`,
		{
			effectiveFrom: '2000-01-01',
			expectedRevision: submitted.body.revision,
			reason: 'Publish',
		},
	)
	expect(early.status).toBe(400)
	expect(early.body.fieldErrors).toEqual([{ field: 'effectiveFrom', code: 'not-after-current' }])
	const body = {
		effectiveFrom: '2027-01-01',
		expectedRevision: submitted.body.revision,
		reason: 'Approved by leadership',
	}
	const [first, second] = await Promise.all([
		api.send<CatalogueVersionDto>(
			'david',
			'POST',
			`${base}/catalogue-versions/${seg(V2)}/publish`,
			body,
		),
		api.send<CatalogueVersionDto>(
			'david',
			'POST',
			`${base}/catalogue-versions/${seg(V2)}/publish`,
			body,
		),
	])
	expect([first.status, second.status].sort()).toEqual([200, 409])
	const v2 = await version(V2)
	expect(v2).toMatchObject({
		status: 'Published',
		current: true,
		effectiveFrom: '2027-01-01',
		effectiveTo: null,
	})
	expect(await version(V1)).toMatchObject({
		status: 'Superseded',
		current: false,
		effectiveTo: '2026-12-31',
	})
	const sales = await api.send<JobProfileVersionDto>(
		'david',
		'GET',
		`${base}/profile-versions/${seg('dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1')}`,
	)
	expect(sales.body).toMatchObject({ status: 'Published', catalogueVersionNumber: 1 })
	const audit = await api.admin.query<{ reason: string; toState: string }>(
		"SELECT safe_summary->>'reason' AS reason,safe_summary->>'toState' AS \"toState\" FROM hcm.audit_event WHERE action='job-architecture.catalogue-version-published' AND target_id=$1",
		[V2],
	)
	expect(audit.rows).toEqual([{ reason: 'Approved by leadership', toState: 'Published' }])
	expect(
		(
			await api.admin.query(
				'SELECT count(*)::int AS n FROM hcm.job_catalogue_version WHERE effective_from IS NOT NULL',
			)
		).rows[0],
	).toEqual({ n: 2 })
})

it('creates, revises and publishes a job profile with compatible references', /** REQ-JOB-CATALOGUE-003, REQ-JOB-CATALOGUE-007. */ async () => {
	/** Create a profile as David. */
	const create = (body: Record<string, unknown>, key = randomUUID()) =>
		api.send<JobProfileVersionDto & { code: string; fieldErrors?: unknown[] }>(
			'david',
			'POST',
			`${base}/profiles`,
			body,
			{
				'idempotency-key': key,
			},
		)
	const refused = [
		[{ familyId: 'dunder-mifflin/job-family/v1/INSIDE_SALES' }, 'familyId'],
		[{ catalogueVersionId: V1 }, 'catalogueVersionId'],
		[{ levelId: `${V2}/levels/M1` }, 'levelId'],
		[
			{
				allowedGrades: [
					{ gradeId: `${V2}/grades/G1`, isDefault: true },
					{ gradeId: `${V2}/grades/G2`, isDefault: true },
				],
			},
			'allowedGrades',
		],
		[{ allowedGrades: [{ gradeId: `${V2}/grades/G8`, isDefault: true }] }, 'allowedGrades'],
		[
			{
				requirements: [
					{ code: 'X1', type: 'Experience', name: 'X', minimumQuantity: -1, unit: 'Years' },
				],
			},
			'requirements.0.minimumQuantity',
		],
	] as const
	for (const [override, field] of refused) {
		const reply = await create({
			code: 'ORDER_CLERK',
			name: 'Order Clerk',
			draft: draft(override),
			reason: 'New role',
		})
		expect(reply.status, field).toBe(400)
		expect(JSON.stringify(reply.body.fieldErrors), field).toContain(field)
	}
	expect(
		(
			await create({
				code: 'ORDER_CLERK',
				name: 'Order Clerk',
				draft: { ...draft(), salary: 1 },
				reason: 'New role',
			})
		).status,
	).toBe(400)
	const key = randomUUID()
	const body = { code: 'ORDER_CLERK', name: 'Order Clerk', draft: draft(), reason: 'New role' }
	const created = await create(body, key)
	expect(created.status).toBe(201)
	expect(created.body).toMatchObject({
		profileCode: 'ORDER_CLERK',
		status: 'Draft',
		versionNumber: 1,
		catalogueVersionNumber: 2,
		allowedGrades: [
			{ code: 'G1', isDefault: true },
			{ code: 'G2', isDefault: false },
		],
	})
	expect((await create(body, key)).body).toEqual(created.body)
	expect((await create({ ...body, name: 'Other' }, key)).status).toBe(409)
	expect((await create({ ...body, draft: draft() })).status).toBe(409)

	const id = created.body.id
	const updated = await api.send<JobProfileVersionDto>(
		'david',
		'PUT',
		`${base}/profile-versions/${seg(id)}`,
		{
			draft: draft({
				levelId: `${V2}/levels/IC2`,
				allowedGrades: [{ gradeId: `${V2}/grades/G3`, isDefault: true }],
			}),
			expectedRevision: created.body.revision,
			reason: 'Level corrected',
		},
	)
	expect(updated.status).toBe(200)
	expect(updated.body).toMatchObject({
		level: { code: 'IC2' },
		allowedGrades: [{ code: 'G3', isDefault: true }],
	})
	const submitted = await api.send<JobProfileVersionDto>(
		'david',
		'POST',
		`${base}/profile-versions/${seg(id)}/submit`,
		{
			expectedRevision: updated.body.revision,
			reason: 'Ready',
		},
	)
	expect(submitted.body.status).toBe('InReview')
	expect(
		(
			await api.send('toby', 'POST', `${base}/profile-versions/${seg(id)}/publish`, {
				effectiveFrom: '2027-02-01',
				expectedRevision: submitted.body.revision,
				reason: 'Publish',
			})
		).status,
	).toBe(403)
	const published = await api.send<JobProfileVersionDto>(
		'david',
		'POST',
		`${base}/profile-versions/${seg(id)}/publish`,
		{
			effectiveFrom: '2027-02-01',
			expectedRevision: submitted.body.revision,
			reason: 'Approved',
		},
	)
	expect(published.status).toBe(200)
	expect(published.body).toMatchObject({
		status: 'Published',
		current: true,
		effectiveFrom: '2027-02-01',
	})
	const successor = await api.send<JobProfileVersionDto>(
		'david',
		'POST',
		`${base}/profiles/${seg(published.body.profileId)}/versions`,
		{
			basedOnVersionId: id,
			reason: 'Annual review',
		},
	)
	expect(successor.status).toBe(201)
	expect(successor.body).toMatchObject({
		versionNumber: 2,
		status: 'Draft',
		allowedGrades: [{ code: 'G3' }],
	})
	expect(
		(
			await api.send(
				'david',
				'POST',
				`${base}/profiles/${seg(published.body.profileId)}/versions`,
				{
					basedOnVersionId: id,
					reason: 'Again',
				},
			)
		).status,
	).toBe(409)
	const list = await api.send<JobProfilePage>('toby', 'GET', `${base}/profiles?status=Draft`)
	expect(list.body.items.map(/** Code. */ (p) => p.code)).toEqual(['ORDER_CLERK'])
})

it('authorizes every request independently of navigation', /** REQ-JOB-CATALOGUE-005. */ async () => {
	await api.admin.query(
		"UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.job-architecture'",
	)
	try {
		expect((await api.send('david', 'GET', `${base}/catalogues`)).status).toBe(403)
	} finally {
		await api.admin.query(
			"UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.job-architecture'",
		)
	}
	await api.admin.query(
		"DELETE FROM hcm.role_permission WHERE role_id='hr-specialist' AND permission_code='hcm.job-architecture.catalogue.read'",
	)
	try {
		expect((await api.send('toby', 'GET', `${base}/profiles`)).status).toBe(403)
	} finally {
		await api.admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES('local-dunder-mifflin','hr-specialist','hcm.job-architecture.catalogue.read')",
		)
	}
	await api.admin.query('UPDATE hcm.user_account SET enabled=false WHERE id=$1', [
		'dunder-mifflin/account/david',
	])
	try {
		expect([401, 403]).toContain((await api.send('david', 'GET', `${base}/catalogues`)).status)
	} finally {
		await api.admin.query('UPDATE hcm.user_account SET enabled=true WHERE id=$1', [
			'dunder-mifflin/account/david',
		])
	}
	expect([404, 405]).toContain(
		(await api.send('david', 'DELETE', `${base}/catalogue-versions/${seg(V1)}`)).status,
	)
})
