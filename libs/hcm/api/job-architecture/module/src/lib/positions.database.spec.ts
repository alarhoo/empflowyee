import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type {
	IncumbentPage,
	PositionChangeRequestDto,
	PositionChangeRequestPage,
	PositionDetailDto,
	PositionOptionPage,
	PositionPage,
	PositionVersionPage,
} from '@empflowyee/hcm-job-architecture-contract'
import { HcmJobArchitectureModule } from './hcm-api-job-architecture-module'
import { startHcmTestApi, type HcmTestApi } from './job-architecture-test-harness'

let api: HcmTestApi
const P = 'dunder-mifflin/position/'
const SALES_PROFILE = 'dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1'
type Reply = PositionChangeRequestDto & { code?: string; fieldErrors?: { field: string }[] }

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

/** A valid proposal for a Scranton sales seat. */
function proposal(overrides: Record<string, unknown> = {}) {
	return {
		name: 'Sales Representative II, Scranton',
		profileVersionId: SALES_PROFILE,
		gradeId: 'dunder-mifflin/job-grade/v1/G3',
		designationId: 'dunder-mifflin/designation/sales-representative',
		legalEntityId: 'dunder-mifflin/legal-entity/dmpc',
		unitId: 'dunder-mifflin/organisation/scranton',
		departmentId: 'dunder-mifflin/department/sales',
		locationId: 'dunder-mifflin/location/scranton',
		positionType: 'Regular',
		headcountCapacity: 2,
		fteCapacity: 1.5,
		keyPosition: false,
		costCenterCode: 'SCR-SALES',
		effectiveFrom: '2026-10-01',
		reportsToPositionId: `${P}SCR-REGIONAL-MGR`,
		...overrides,
	}
}

/** Raise a request as a persona. */
function raise(body: Record<string, unknown>, persona = 'toby') {
	return api.send<Reply>(persona, 'POST', 'job-architecture/position-change-requests', body)
}

/** Run one request command at the request's current revision. */
async function step(
	id: string,
	action: 'preview' | 'submit' | 'withdraw' | 'decide',
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
		{ expectedRevision: current.revision, ...body },
	)
}

/** Preview and submit a draft request. */
async function previewAndSubmit(id: string): Promise<Reply> {
	const previewed = await step(id, 'preview')
	expect(previewed.status).toBe(200)
	const submitted = await step(id, 'submit', { previewId: previewed.body.preview?.id })
	expect(submitted.status).toBe(200)
	return submitted.body
}

/** Read one position as Toby. */
async function position(id: string): Promise<PositionDetailDto> {
	return (await api.send<PositionDetailDto>('toby', 'GET', `job-architecture/positions/${seg(id)}`))
		.body
}

describe('Positions', /** Positions FDD. */ () => {
	it('lists positions with occupancy, remaining capacity and vacancy', /** REQ-POSITIONS-001. */ async () => {
		for (const persona of ['toby', 'david']) {
			const page = await api.send<PositionPage>(persona, 'GET', 'job-architecture/positions')
			expect(page.status).toBe(200)
			expect(page.body.items.map(/** Code. */ (item) => item.code)).toEqual([
				'SCR-ACCOUNTANT',
				'SCR-ASST-RM',
				'SCR-HR-REP',
				'SCR-REGIONAL-MGR',
				'SCR-SALES-REP',
				'SCR-SENIOR-ACCT',
			])
		}
		const sales = (
			await api.send<PositionPage>('toby', 'GET', 'job-architecture/positions?q=SALES')
		).body.items[0]
		expect(sales).toMatchObject({
			lifecycleStatus: 'Open',
			headcountCapacity: 2,
			fteCapacity: 2,
			occupiedHeadcount: 1,
			occupiedFte: 1,
			occupancyComplete: true,
			remainingHeadcount: 1,
			remainingFte: 1,
			profile: { code: 'SALES_REPRESENTATIVE' },
			placement: { unit: { id: 'dunder-mifflin/organisation/scranton' } },
		})
		const vacant = await api.send<PositionPage>(
			'toby',
			'GET',
			'job-architecture/positions?hasVacancy=true&limit=1',
		)
		expect(vacant.body.items.map(/** Code. */ (item) => item.code)).toEqual(['SCR-ACCOUNTANT'])
		const next = await api.send<PositionPage>(
			'toby',
			'GET',
			`job-architecture/positions?hasVacancy=true&limit=1&cursor=${encodeURIComponent(vacant.body.nextCursor ?? '')}`,
		)
		expect(next.body.items.map(/** Code. */ (item) => item.code)).toEqual(['SCR-SALES-REP'])
		const full = await api.send<PositionPage>(
			'toby',
			'GET',
			'job-architecture/positions?hasVacancy=false&sort=name:asc',
		)
		expect(full.body.items).toHaveLength(4)
		for (const persona of ['jim', 'michael'])
			expect((await api.send(persona, 'GET', 'job-architecture/positions')).status).toBe(403)
		expect((await api.send('toby', 'GET', 'job-architecture/positions?bogus=1')).status).toBe(400)
	})

	it('shows placement, incumbents, relationships and versions', /** REQ-POSITIONS-001. */ async () => {
		const detail = await position(`${P}SCR-REGIONAL-MGR`)
		expect(detail.currentVersion).toMatchObject({
			versionNumber: 1,
			keyPosition: true,
			current: true,
		})
		expect(
			detail.relationships.map(/** Summary. */ (r) => [r.direction, r.type, r.position.code]),
		).toEqual([
			['Incoming', 'SolidLine', 'SCR-ASST-RM'],
			['Incoming', 'SolidLine', 'SCR-SALES-REP'],
		])
		const incumbents = await api.send<IncumbentPage>(
			'toby',
			'GET',
			`job-architecture/positions/${seg(`${P}SCR-REGIONAL-MGR`)}/incumbents`,
		)
		expect(incumbents.body.items.map(/** Name. */ (item) => item.displayName)).toEqual([
			'Michael Scott',
		])
		const versions = await api.send<PositionVersionPage>(
			'toby',
			'GET',
			`job-architecture/positions/${seg(`${P}SCR-REGIONAL-MGR`)}/versions`,
		)
		expect(versions.body.items).toHaveLength(1)
		expect((await api.send('toby', 'GET', 'job-architecture/positions/nope')).status).toBe(404)
		const profiles = await api.send<PositionOptionPage>(
			'toby',
			'GET',
			'job-architecture/position-options/profiles?q=Sales',
		)
		expect(profiles.body.items[0]?.grades.length).toBeGreaterThan(0)
		// Options are for requesters only.
		expect((await api.send('david', 'GET', 'job-architecture/position-options/units')).status).toBe(
			403,
		)
	})

	it('creates a position through preview, submission and independent approval', /** REQ-POSITIONS-002, REQ-POSITIONS-004. */ async () => {
		const created = await raise({
			requestType: 'Create',
			code: 'SCR-SALES-REP-2',
			proposed: proposal(),
			reason: 'Second sales team for the Stamford merger',
		})
		expect(created.status).toBe(201)
		expect(created.body).toMatchObject({
			requestType: 'Create',
			status: 'Draft',
			reason: 'Second sales team for the Stamford merger',
			requestedByMe: true,
			proposed: { headcountCapacity: 2, reportsTo: { code: 'SCR-REGIONAL-MGR' } },
		})
		expect(created.body.items.length).toBeGreaterThan(5)
		// The reason is stored only as ciphertext and never in the audit evidence.
		const stored = await api.admin.query<{ reason: Buffer }>(
			'SELECT encrypted_reason AS reason FROM hcm.position_change_request WHERE id=$1',
			[created.body.id],
		)
		expect(stored.rows[0]?.reason.toString('utf8')).not.toContain('Stamford')
		expect(
			(
				await api.admin.query(
					"SELECT 1 FROM hcm.audit_event WHERE safe_summary::text LIKE '%Stamford%'",
				)
			).rowCount,
		).toBe(0)
		// The requester cannot decide; nor can anyone before submission.
		expect((await step(created.body.id, 'decide', { decision: 'Approved' }, 'toby')).status).toBe(
			403,
		)
		const submitted = await previewAndSubmit(created.body.id)
		expect(submitted).toMatchObject({
			status: 'PendingApproval',
			approval: { status: 'Pending', requiresWaiveAuthority: false },
			canDecide: false,
		})
		const awaiting = await api.send<PositionChangeRequestPage>(
			'david',
			'GET',
			'job-architecture/position-change-requests?view=awaiting-my-decision',
		)
		expect(awaiting.body.items.map(/** Id. */ (item) => item.id)).toEqual([created.body.id])
		const asDavid = await api.send<Reply>(
			'david',
			'GET',
			`job-architecture/position-change-requests/${seg(created.body.id)}`,
		)
		expect(asDavid.body).toMatchObject({
			canDecide: true,
			reason: 'Second sales team for the Stamford merger',
		})
		const approved = await step(
			created.body.id,
			'decide',
			{ decision: 'Approved', comment: 'Budget confirmed' },
			'david',
		)
		expect(approved.status).toBe(200)
		expect(approved.body).toMatchObject({
			status: 'Applied',
			approval: {
				status: 'Approved',
				decision: { decision: 'Approved', comment: 'Budget confirmed' },
			},
		})
		// Deciding again is refused.
		expect((await step(created.body.id, 'decide', { decision: 'Approved' }, 'david')).status).toBe(
			409,
		)
		const detail = await position(created.body.positionId)
		expect(detail).toMatchObject({
			code: 'SCR-SALES-REP-2',
			name: 'Sales Representative II, Scranton',
			lifecycleStatus: 'Open',
			headcountCapacity: 2,
			fteCapacity: 1.5,
			occupiedHeadcount: 0,
			remainingHeadcount: 2,
			currentVersion: { status: 'Published', effectiveFrom: '2026-10-01' },
		})
		// The solid line starts with the version, so it is not yet effective today.
		const lines = await api.admin.query(
			"SELECT to_char(effective_from,'YYYY-MM-DD') AS f FROM hcm.position_relationship WHERE source_position_id=$1",
			[created.body.positionId],
		)
		expect(lines.rows).toEqual([{ f: '2026-10-01' }])
		const audit = await api.admin.query<{ action: string }>(
			'SELECT action FROM hcm.audit_event WHERE target_id IN ($1,$2) ORDER BY occurred_at,action',
			[created.body.id, created.body.positionId],
		)
		expect(audit.rows.map(/** Action. */ (row) => row.action)).toEqual(
			expect.arrayContaining([
				'job-architecture.position-change-requested',
				'job-architecture.position-change-previewed',
				'job-architecture.position-change-submitted',
				'job-architecture.position-version-published',
				'job-architecture.position-change-approved',
			]),
		)
	})

	it('rejects invalid proposals before submission', /** REQ-POSITIONS-002. */ async () => {
		/** Create with overrides and return the failing fields. */
		const fields = async (overrides: Record<string, unknown>, code = 'SCR-BAD') => {
			const reply = await raise({
				requestType: 'Create',
				code,
				proposed: proposal(overrides),
				reason: 'Test',
			})
			return [
				reply.status,
				reply.body.code,
				...(reply.body.fieldErrors ?? []).map(/** Field. */ (item) => item.field),
			]
		}
		expect(await fields({ gradeId: 'dunder-mifflin/job-grade/v1/G8' })).toEqual([
			400,
			'invalid-request',
			'gradeId',
		])
		expect(await fields({ headcountCapacity: 1, fteCapacity: 1.5 })).toEqual([
			400,
			'invalid-request',
			'fteCapacity',
		])
		expect(await fields({ headcountCapacity: 0 })).toEqual([
			400,
			'invalid-request',
			'headcountCapacity',
		])
		expect(await fields({ unitId: 'nope' })).toEqual([400, 'invalid-request', 'unitId'])
		expect(await fields({}, 'SCR-SALES-REP')).toEqual([409, 'duplicate-code', 'code'])
		expect(await fields({ reportsToPositionId: 'nope' })).toEqual([
			400,
			'invalid-request',
			'reportsToPositionId',
		])
	})

	it('blocks submission with a stale or expired preview', /** REQ-POSITIONS-003. */ async () => {
		const created = await raise({
			requestType: 'Change',
			positionId: `${P}SCR-ACCOUNTANT`,
			proposed: proposal({
				name: 'Accountant, Scranton',
				profileVersionId: 'dunder-mifflin/job-profile/ACCOUNTANT/v1',
				designationId: 'dunder-mifflin/designation/accountant',
				departmentId: 'dunder-mifflin/department/accounting',
				reportsToPositionId: `${P}SCR-SENIOR-ACCT`,
				headcountCapacity: 3,
				fteCapacity: 3,
			}),
			reason: 'Year-end workload',
		})
		expect(created.status).toBe(201)
		expect(created.body.base).toMatchObject({ versionNumber: 1 })
		expect(created.body.items.map(/** Field. */ (item) => item.field)).toEqual(
			expect.arrayContaining(['headcountCapacity', 'fteCapacity', 'effectiveFrom']),
		)
		// A second request on the same position is refused while this one is open.
		expect(
			(await raise({ requestType: 'Freeze', positionId: `${P}SCR-ACCOUNTANT`, reason: 'x' }))
				.status,
		).toBe(409)
		const first = await step(created.body.id, 'preview')
		expect(first.body.preview).toMatchObject({
			activeAssignmentCount: 1,
			assignedFte: 1,
			occupancyComplete: true,
			valid: true,
		})
		// Editing after preview makes it stale in the UI and on the server.
		const edited = await api.send<Reply>(
			'toby',
			'PUT',
			`job-architecture/position-change-requests/${seg(created.body.id)}`,
			{
				proposed: proposal({
					name: 'Accountant, Scranton',
					profileVersionId: 'dunder-mifflin/job-profile/ACCOUNTANT/v1',
					designationId: 'dunder-mifflin/designation/accountant',
					departmentId: 'dunder-mifflin/department/accounting',
					reportsToPositionId: `${P}SCR-SENIOR-ACCT`,
					headcountCapacity: 4,
					fteCapacity: 4,
				}),
				reason: 'Year-end workload',
				expectedRevision: first.body.revision,
			},
		)
		expect(edited.status).toBe(200)
		expect(edited.body).toMatchObject({
			status: 'Draft',
			preview: { status: 'Stale', valid: false },
		})
		const refused = await api.send<Reply>(
			'toby',
			'POST',
			`job-architecture/position-change-requests/${seg(created.body.id)}/submit`,
			{ previewId: first.body.preview?.id, expectedRevision: edited.body.revision },
		)
		expect([refused.status, refused.body.code]).toEqual([409, 'invalid-state'])
		const second = await step(created.body.id, 'preview')
		await api.admin.query(
			"UPDATE hcm.position_impact_preview SET calculated_at=now()-interval '1 hour',expires_at=now()-interval '1 minute' WHERE id=$1",
			[second.body.preview?.id],
		)
		const expired = await step(created.body.id, 'submit', { previewId: second.body.preview?.id })
		expect([expired.status, expired.body.code]).toEqual([409, 'preview-stale'])
		const withdrawn = await step(created.body.id, 'withdraw', { reason: 'Budget frozen by Jan' })
		expect(withdrawn.body.status).toBe('Withdrawn')
		const sealed = await api.admin.query<{ w: Buffer }>(
			'SELECT encrypted_withdrawal_reason AS w FROM hcm.position_change_request WHERE id=$1',
			[created.body.id],
		)
		expect(sealed.rows[0]?.w.toString('utf8')).not.toContain('Jan')
		expect((await position(`${P}SCR-ACCOUNTANT`)).headcountCapacity).toBe(2)
	})

	it('changes lifecycle without ending assignments, and refuses unsafe cancellation', /** REQ-POSITIONS-003, business rule 17. */ async () => {
		expect(
			(await raise({ requestType: 'Cancel', positionId: `${P}SCR-HR-REP`, reason: 'Toby leaves' }))
				.body.code,
		).toBe('invalid-state')
		const freeze = await raise({
			requestType: 'Freeze',
			positionId: `${P}SCR-HR-REP`,
			reason: 'Hiring pause',
		})
		expect(freeze.body.items).toEqual([
			{ field: 'lifecycleStatus', changeType: 'Set', summary: 'Status: Open → Frozen' },
		])
		await previewAndSubmit(freeze.body.id)
		expect(
			(await step(freeze.body.id, 'decide', { decision: 'Approved' }, 'david')).body.status,
		).toBe('Applied')
		const close = await raise({
			requestType: 'Close',
			positionId: `${P}SCR-HR-REP`,
			reason: 'Outsourced',
		})
		await previewAndSubmit(close.body.id)
		await step(close.body.id, 'decide', { decision: 'Approved' }, 'david')
		const closed = await position(`${P}SCR-HR-REP`)
		expect(closed).toMatchObject({ lifecycleStatus: 'Closed', occupiedHeadcount: 1 })
		const assignment = await api.admin.query(
			'SELECT effective_to AS "effectiveTo" FROM hcm.assignment WHERE id=\'dunder-mifflin/assignment/toby\'',
		)
		expect(assignment.rows).toEqual([{ effectiveTo: null }])
		// Frozen or closed positions refuse a second freeze.
		expect(
			(await raise({ requestType: 'Freeze', positionId: `${P}SCR-HR-REP`, reason: 'x' })).body.code,
		).toBe('invalid-state')
	})

	it('rejects with a comment, cancelling a never-published position', /** REQ-POSITIONS-004. */ async () => {
		const created = await raise({
			requestType: 'Create',
			code: 'SCR-WAREHOUSE',
			proposed: proposal({ name: 'Warehouse Associate', reportsToPositionId: null }),
			reason: 'Warehouse coverage',
		})
		await previewAndSubmit(created.body.id)
		const noComment = await step(created.body.id, 'decide', { decision: 'Rejected' }, 'david')
		expect(noComment.body.fieldErrors).toEqual([{ field: 'comment', code: 'required' }])
		const rejected = await step(
			created.body.id,
			'decide',
			{ decision: 'Rejected', comment: 'Use the existing warehouse team' },
			'david',
		)
		expect(rejected.body).toMatchObject({ status: 'Rejected', approval: { status: 'Rejected' } })
		expect((await position(created.body.positionId)).lifecycleStatus).toBe('Cancelled')
		// A reader without request or approve authority never sees reasons or comments.
		await api.admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES ('local-dunder-mifflin','manager','hcm.job-architecture.positions.read')",
		)
		const asMichael = await api.send<Reply>(
			'michael',
			'GET',
			`job-architecture/position-change-requests/${seg(created.body.id)}`,
		)
		expect(asMichael.body).toMatchObject({
			reason: null,
			approval: { decision: { comment: null } },
		})
		await api.admin.query(
			"DELETE FROM hcm.role_permission WHERE role_id='manager' AND permission_code='hcm.job-architecture.positions.read'",
		)
	})

	it('refuses self-approval even with both grants and replays retries', /** REQ-POSITIONS-004, REQ-POSITIONS-008. */ async () => {
		await api.admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES ('local-dunder-mifflin','tenant-administrator','hcm.job-architecture.positions.request')",
		)
		try {
			const key = randomUUID()
			const body = {
				requestType: 'Freeze',
				positionId: `${P}SCR-SENIOR-ACCT`,
				reason: 'Pause',
			}
			const first = await api.send<Reply>(
				'david',
				'POST',
				'job-architecture/position-change-requests',
				body,
				{
					'idempotency-key': key,
				},
			)
			const replay = await api.send<Reply>(
				'david',
				'POST',
				'job-architecture/position-change-requests',
				body,
				{
					'idempotency-key': key,
				},
			)
			expect(replay.body.id).toBe(first.body.id)
			const conflict = await api.send<Reply>(
				'david',
				'POST',
				'job-architecture/position-change-requests',
				{ ...body, reason: 'Other' },
				{ 'idempotency-key': key },
			)
			expect([conflict.status, conflict.body.code]).toEqual([409, 'idempotency-conflict'])
			const previewed = await step(first.body.id, 'preview', {}, 'david')
			await step(first.body.id, 'submit', { previewId: previewed.body.preview?.id }, 'david')
			const own = await step(first.body.id, 'decide', { decision: 'Approved' }, 'david')
			expect([own.status, own.body.code]).toEqual([403, 'self-approval-forbidden'])
			expect(
				(await step(first.body.id, 'withdraw', { reason: 'Mistake' }, 'david')).body.status,
			).toBe('Withdrawn')
		} finally {
			await api.admin.query(
				"DELETE FROM hcm.role_permission WHERE role_id='tenant-administrator' AND permission_code='hcm.job-architecture.positions.request'",
			)
		}
		// Only the requester changes their own request.
		const mine = await raise({
			requestType: 'Freeze',
			positionId: `${P}SCR-SENIOR-ACCT`,
			reason: 'Pause',
		})
		expect((await step(mine.body.id, 'preview', {}, 'david')).status).toBe(403)
	})
})
