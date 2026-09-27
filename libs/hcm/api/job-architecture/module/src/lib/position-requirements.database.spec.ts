import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type {
	EffectiveRequirementDto,
	PositionChangeRequestDto,
	PositionRequirementPage,
	RequirementDto,
} from '@empflowyee/hcm-job-architecture-contract'
import { HcmJobArchitectureModule } from './hcm-api-job-architecture-module'
import { startHcmTestApi, type HcmTestApi } from './job-architecture-test-harness'

let api: HcmTestApi
const SALES = 'dunder-mifflin/position/SCR-SALES-REP'
const ACCOUNTANT = 'dunder-mifflin/position/SCR-ACCOUNTANT'
type Reply = PositionChangeRequestDto & {
	code?: string
	fieldErrors?: { field: string; code: string }[]
}

beforeAll(
	/** Start the real module over the migrated and seeded disposable database. */ async () => {
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

const forklift = {
	code: 'FORKLIFT',
	varianceType: 'Add',
	type: 'Licence',
	name: 'Forklift licence',
	mandatory: false,
}
const experience = {
	code: 'EXPERIENCE',
	varianceType: 'Strengthen',
	sourceCode: 'EXPERIENCE',
	type: 'Experience',
	name: 'Business-to-business sales',
	minimumQuantity: 3,
	unit: 'Years',
}
const waiveNegotiation = {
	code: 'NEGOTIATION',
	varianceType: 'Waive',
	sourceCode: 'NEGOTIATION',
	type: 'Skill',
	name: 'Negotiation',
	justification: 'Scripted inbound calls only; no price negotiation',
}

/** Effective requirements of a position. */
async function effective(id: string): Promise<EffectiveRequirementDto[]> {
	return (
		await api.send<{ items: EffectiveRequirementDto[] }>(
			'toby',
			'GET',
			`job-architecture/positions/${seg(id)}/requirements`,
		)
	).body.items
}

/** Propose variances on a position. */
function propose(id: string, variances: unknown[], persona = 'toby') {
	return api.send<Reply>(
		persona,
		'POST',
		`job-architecture/positions/${seg(id)}/requirement-changes`,
		{
			variances,
			reason: 'Inbound sales pilot',
		},
	)
}

/** Run a Positions request command at the current revision. */
async function step(
	id: string,
	action: string,
	body: Record<string, unknown> = {},
	persona = 'toby',
) {
	const current = (
		await api.send<Reply>(persona, 'GET', `job-architecture/position-change-requests/${seg(id)}`)
	).body
	return api.send<Reply>(
		persona,
		'POST',
		`job-architecture/position-change-requests/${seg(id)}/${action}`,
		{
			expectedRevision: current.revision,
			...body,
		},
	)
}

describe('Position Requirements', /** Position Requirements FDD. */ () => {
	it('lists positions and shows effective and profile requirements', /** REQ-POSITION-REQUIREMENTS-001. */ async () => {
		for (const persona of ['toby', 'david']) {
			const page = await api.send<PositionRequirementPage>(
				persona,
				'GET',
				'job-architecture/position-requirements',
			)
			expect(page.status).toBe(200)
			expect(page.body.items).toHaveLength(6)
			expect(
				page.body.items.every(/** No variances seeded. */ (item) => item.varianceCount === 0),
			).toBe(true)
		}
		expect(
			(
				await api.send<PositionRequirementPage>(
					'toby',
					'GET',
					'job-architecture/position-requirements?hasVariances=true',
				)
			).body.items,
		).toEqual([])
		const profile = await api.send<{ items: RequirementDto[] }>(
			'toby',
			'GET',
			`job-architecture/positions/${seg(SALES)}/profile-requirements`,
		)
		expect(profile.body.items.map(/** Code. */ (item) => item.code)).toEqual([
			'EXPERIENCE',
			'NEGOTIATION',
		])
		expect(await effective(SALES)).toMatchObject([
			{ code: 'EXPERIENCE', source: 'Profile', variance: null, waived: false },
			{ code: 'NEGOTIATION', source: 'Profile', variance: null, waived: false },
		])
		for (const persona of ['jim', 'michael'])
			expect(
				(await api.send(persona, 'GET', 'job-architecture/position-requirements')).status,
			).toBe(403)
		// Proposing needs the request grant.
		expect((await propose(SALES, [forklift], 'david')).status).toBe(403)
	})

	it('rejects invalid variances with field errors', /** REQ-POSITION-REQUIREMENTS-002. */ async () => {
		/** The failing field and code of a proposal. */
		const failure = async (variances: unknown[]) => {
			const reply = await propose(SALES, variances)
			return [reply.status, reply.body.fieldErrors?.[0]?.field, reply.body.fieldErrors?.[0]?.code]
		}
		expect(
			await failure([{ ...experience, sourceCode: undefined, varianceType: 'Replace' }]),
		).toEqual([400, 'variances.0.sourceCode', 'required'])
		expect(await failure([forklift, { ...forklift, name: 'Again' }])).toEqual([
			400,
			'variances.1.code',
			'duplicate',
		])
		expect(await failure([{ ...forklift, minimumQuantity: -1, unit: 'Years' }])).toEqual([
			400,
			'variances.0.minimumQuantity',
			'invalid',
		])
		expect(await failure([{ ...waiveNegotiation, justification: undefined }])).toEqual([
			400,
			'variances.0.justification',
			'required',
		])
		expect(await failure([{ ...experience, minimumQuantity: 0.5 }])).toEqual([
			400,
			'variances.0.minimumQuantity',
			'weakened',
		])
		expect(await failure([{ ...forklift, code: 'EXPERIENCE' }])).toEqual([
			400,
			'variances.0.code',
			'duplicate',
		])
		expect(
			await failure([{ ...experience, varianceType: 'Replace', sourceCode: 'NOPE', code: 'NOPE' }]),
		).toEqual([400, 'variances.0.sourceCode', 'unknown'])
	})

	it('waives only with justification and an approver holding the waive grant', /** REQ-POSITION-REQUIREMENTS-003, REQ-POSITION-REQUIREMENTS-004. */ async () => {
		const created = await propose(SALES, [forklift, experience, waiveNegotiation])
		expect(created.status).toBe(201)
		expect(created.body).toMatchObject({
			requestType: 'Change',
			status: 'Draft',
			variances: [
				{ code: 'FORKLIFT', varianceType: 'Add' },
				{ code: 'EXPERIENCE', varianceType: 'Strengthen', minimumQuantity: 3 },
				{ code: 'NEGOTIATION', varianceType: 'Waive', justification: waiveNegotiation.justification },
			],
		})
		expect(created.body.items.map(/** Change type. */ (item) => item.changeType)).toEqual(
			expect.arrayContaining(['AddRequirement']),
		)
		// The justification is ciphertext only and never in audit evidence.
		const sealed = await api.admin.query<{ j: Buffer }>(
			"SELECT encrypted_justification AS j FROM hcm.position_requirement WHERE requirement_code='NEGOTIATION' AND variance_type='Waive'",
		)
		expect(sealed.rows[0]?.j.toString('utf8')).not.toContain('Scripted')
		expect(
			(
				await api.admin.query(
					"SELECT 1 FROM hcm.audit_event WHERE safe_summary::text LIKE '%Scripted%'",
				)
			).rowCount,
		).toBe(0)
		// Editing the variances after preview makes the preview stale.
		const previewed = await step(created.body.id, 'preview')
		const edited = await api.send<Reply>(
			'toby',
			'PUT',
			`job-architecture/position-change-requests/${seg(created.body.id)}/requirements`,
			{
				variances: [experience, waiveNegotiation, forklift],
				expectedRevision: previewed.body.revision,
			},
		)
		expect(edited.body).toMatchObject({ status: 'Draft', preview: { status: 'Stale' } })
		const again = await step(created.body.id, 'preview')
		const submitted = await step(created.body.id, 'submit', { previewId: again.body.preview?.id })
		expect(submitted.body).toMatchObject({
			status: 'PendingApproval',
			approval: { requiresWaiveAuthority: true },
		})
		// Without the waive grant an approver cannot decide a request containing a Waive.
		await api.admin.query(
			"DELETE FROM hcm.role_permission WHERE role_id='tenant-administrator' AND permission_code='hcm.job-architecture.position-requirements.waive'",
		)
		try {
			const view = await api.send<Reply>(
				'david',
				'GET',
				`job-architecture/position-change-requests/${seg(created.body.id)}`,
			)
			expect(view.body.canDecide).toBe(false)
			expect(
				(await step(created.body.id, 'decide', { decision: 'Approved' }, 'david')).status,
			).toBe(403)
		} finally {
			await api.admin.query(
				"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES ('local-dunder-mifflin','tenant-administrator','hcm.job-architecture.position-requirements.waive')",
			)
		}
		// Nothing applies before approval.
		expect((await effective(SALES)).every(/** Unchanged. */ (item) => item.variance === null)).toBe(
			true,
		)
		const approved = await step(created.body.id, 'decide', { decision: 'Approved' }, 'david')
		expect(approved.body.status).toBe('Applied')
		// A requirement change takes effect today, the day after the seeded version started at the latest.
		const today = await api.admin.query<{ d: string }>(
			"SELECT to_char(current_date,'YYYY-MM-DD') AS d",
		)
		expect(approved.body.proposed?.effectiveFrom).toBe(today.rows[0]?.d)
	})

	it('shows the approved variances in the effective set and carries them through a change', /** REQ-POSITION-REQUIREMENTS-001, REQ-POSITION-REQUIREMENTS-004. */ async () => {
		const list = await api.send<PositionRequirementPage>(
			'toby',
			'GET',
			'job-architecture/position-requirements?hasVariances=true',
		)
		expect(list.body.items.map(/** Code. */ (item) => item.code)).toEqual(['SCR-SALES-REP'])
		expect(list.body.items[0]?.varianceCount).toBe(3)
		expect(await effective(SALES)).toMatchObject([
			{ code: 'EXPERIENCE', source: 'Position', variance: 'Strengthen', minimumQuantity: 3 },
			{ code: 'NEGOTIATION', source: 'Profile', variance: 'Waive', waived: true },
			{ code: 'FORKLIFT', source: 'Position', variance: 'Add' },
		])
		// A general change with the same profile carries the variances into its successor.
		const position = await api.send<{ currentVersion: { effectiveFrom: string } }>(
			'toby',
			'GET',
			`job-architecture/positions/${seg(SALES)}`,
		)
		const next = new Date(`${position.body.currentVersion.effectiveFrom}T00:00:00Z`)
		next.setUTCDate(next.getUTCDate() + 1)
		const change = await api.send<Reply>(
			'toby',
			'POST',
			'job-architecture/position-change-requests',
			{
				requestType: 'Change',
				positionId: SALES,
				reason: 'More seats',
				proposed: {
					name: 'Sales Representative, Scranton',
					profileVersionId: 'dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1',
					gradeId: 'dunder-mifflin/job-grade/v1/G3',
					designationId: 'dunder-mifflin/designation/sales-representative',
					legalEntityId: 'dunder-mifflin/legal-entity/dmpc',
					unitId: 'dunder-mifflin/organisation/scranton',
					departmentId: 'dunder-mifflin/department/sales',
					locationId: 'dunder-mifflin/location/scranton',
					positionType: 'Regular',
					headcountCapacity: 3,
					fteCapacity: 3,
					effectiveFrom: next.toISOString().slice(0, 10),
					reportsToPositionId: 'dunder-mifflin/position/SCR-REGIONAL-MGR',
				},
			},
		)
		expect(change.status).toBe(201)
		expect(change.body.variances.map(/** Code. */ (item) => item.code)).toEqual([
			'EXPERIENCE',
			'NEGOTIATION',
			'FORKLIFT',
		])
		expect(change.body.variances[1]?.justification).toBe(waiveNegotiation.justification)
		expect(change.body.items.map(/** Field. */ (item) => item.field)).toEqual([
			'headcountCapacity',
			'fteCapacity',
			'effectiveFrom',
		])
		// Choosing another profile starts without the variances.
		const other = await api.send<Reply>(
			'toby',
			'PUT',
			`job-architecture/position-change-requests/${seg(change.body.id)}`,
			{
				proposed: {
					...change.body.proposed,
					versionId: undefined,
					profile: undefined,
					grade: undefined,
					placement: undefined,
					reportsTo: undefined,
					profileVersionId: 'dunder-mifflin/job-profile/ACCOUNTANT/v1',
				},
				reason: 'More seats',
				expectedRevision: change.body.revision,
			},
		)
		expect(other.status).toBe(200)
		expect(other.body.variances).toEqual([])
		expect(
			other.body.items.filter(
				/** Requirement items. */ (item) => item.changeType === 'RemoveRequirement',
			),
		).toHaveLength(3)
		expect((await step(change.body.id, 'withdraw', { reason: 'Not now' })).body.status).toBe(
			'Withdrawn',
		)
	})

	it('leaves the effective set unchanged when a proposal is withdrawn', /** REQ-POSITION-REQUIREMENTS-004. */ async () => {
		const before = await effective(ACCOUNTANT)
		const created = await propose(ACCOUNTANT, [forklift])
		expect(created.status).toBe(201)
		expect((await step(created.body.id, 'withdraw', { reason: 'Dropped' })).body.status).toBe(
			'Withdrawn',
		)
		expect(await effective(ACCOUNTANT)).toEqual(before)
	})
})
