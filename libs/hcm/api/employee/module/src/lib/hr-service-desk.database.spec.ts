import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type {
	HrOptionPage,
	HrServiceConfigPage,
	HrServiceMessagePage,
	HrServiceRequestDto,
	HrServiceRequestPage,
} from '@empflowyee/hcm-employee-contract'
import { HcmEmployeeModule } from './hcm-api-employee-module'
import { startHcmTestApi, type HcmTestApi } from './employee-test-harness'

let api: HcmTestApi
const base = 'employee/hr-service'
const JIM = 'dunder-mifflin/worker/jim'
const TOBY = 'dunder-mifflin/account/toby'
const TEAM = 'dunder-mifflin/hr-team/operations'
const QUESTION = 'dunder-mifflin/hr-request-type/general-question'
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')
type Reply = HrServiceRequestDto & {
	code?: string
	fieldErrors?: { field: string; code: string }[]
}

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

/** An encoded request path. */
function path(id: string, op = ''): string {
	return `${base}/requests/${encodeURIComponent(id)}${op ? '/' + op : ''}`
}

/** Raise a request for Jim as Toby. */
async function raise(subject: string): Promise<HrServiceRequestDto> {
	const reply = await api.send<Reply>('toby', 'POST', `${base}/requests`, {
		subjectWorkerId: JIM,
		typeId: QUESTION,
		priority: 'P2',
		subject,
		description: 'Jim asked about his parking space.',
		reason: 'Raised at the front desk.',
	})
	expect(reply.status, JSON.stringify(reply.body)).toBe(201)
	return reply.body
}

/** Send a status change as Toby. */
function move(request: HrServiceRequestDto, status: string, extra: Record<string, unknown> = {}) {
	return api.send<Reply>('toby', 'POST', path(request.id, 'status'), {
		status,
		expectedRevision: request.revision,
		...extra,
	})
}

describe('HR Service Desk', /** HR Service Desk TDD#API. */ () => {
	it('raises a routed request with running targets and lists it in the queue', /** REQ-HR-SERVICE-DESK-001. */ async () => {
		const created = await raise('Parking space')
		expect(created).toMatchObject({
			status: 'New',
			priority: 'P2',
			team: { id: TEAM },
			requester: { workerId: JIM },
			policy: { code: 'standard', versionNumber: 1 },
			slaState: 'OnTrack',
			actions: { reply: true, note: true, assign: true },
		})
		expect(created.requestNumber).toMatch(/^HR-\d{6}$/)
		expect(
			created.targets.map(
				/** Kind and minutes. */ (t) => `${t.kind}:${t.targetMinutes}:${t.state}`,
			),
		).toEqual(['FirstResponse:1440:OnTrack', 'Resolution:4320:OnTrack'])
		const queue = await api.send<HrServiceRequestPage>('toby', 'GET', `${base}/requests?q=Parking`)
		expect(queue.body.items.map(/** Id. */ (item) => item.id)).toContain(created.id)
		const workers = await api.send<HrOptionPage>('toby', 'GET', `${base}/options/workers?q=Jim`)
		expect(workers.body.items.map(/** Id. */ (item) => item.id)).toContain(JIM)
		const audit = await api.admin.query(
			"SELECT count(*)::int AS n FROM hcm.audit_event WHERE action='employee.hr-request-created' AND target_id=$1",
			[created.id],
		)
		expect(audit.rows[0]).toEqual({ n: 1 })
	})

	it('keeps notes internal, meets first response on the first reply and streams attachments', /** REQ-HR-SERVICE-DESK-002, -003. */ async () => {
		const created = await raise('Desk chair')
		const noted = await api.upload<Reply>(
			'toby',
			path(created.id, 'messages'),
			{
				visibility: 'Internal',
				body: 'Check the facilities budget.',
				expectedRevision: created.revision,
			},
			{ name: 'budget.pdf', type: 'application/pdf', bytes: PDF },
		)
		expect(noted.status, JSON.stringify(noted.body)).toBe(200)
		expect(noted.body.status).toBe('New')
		expect(noted.body.targets[0]?.metAt).toBeNull()
		expect(noted.body.attachments).toMatchObject([
			{ fileName: 'budget.pdf', visibility: 'Internal' },
		])
		const replied = await api.upload<Reply>('toby', path(created.id, 'messages'), {
			visibility: 'EmployeeVisible',
			body: 'We are ordering a new chair.',
			expectedRevision: noted.body.revision,
		})
		expect(replied.status, JSON.stringify(replied.body)).toBe(200)
		expect(replied.body.status).toBe('Open')
		expect(replied.body.targets[0]).toMatchObject({ kind: 'FirstResponse', state: 'Met' })
		const stale = await api.upload<Reply>('toby', path(created.id, 'messages'), {
			visibility: 'Internal',
			body: 'Stale.',
			expectedRevision: created.revision,
		})
		expect(stale.status).toBe(409)
		const messages = await api.send<HrServiceMessagePage>(
			'toby',
			'GET',
			path(created.id, 'messages'),
		)
		expect(
			messages.body.items.map(
				/** Visibility and author side. */ (m) => `${m.visibility}:${m.fromRequester}`,
			),
		).toEqual(['EmployeeVisible:false', 'Internal:false', 'EmployeeVisible:false'])
		const attachment = noted.body.attachments[0]?.id ?? ''
		const file = await api.send<string>(
			'toby',
			'GET',
			path(created.id, `attachments/${attachment}`),
		)
		expect(file.status).toBe(200)
		expect(file.body.startsWith('%PDF-')).toBe(true)
		const audit = await api.admin.query(
			"SELECT count(*)::int AS n FROM hcm.audit_event WHERE action='employee.hr-attachment-downloaded' AND target_id=$1",
			[created.id],
		)
		expect(audit.rows[0]).toEqual({ n: 1 })
		const spoofed = await api.upload<Reply>(
			'toby',
			path(created.id, 'messages'),
			{ visibility: 'Internal', body: 'Not a PDF.', expectedRevision: replied.body.revision },
			{ name: 'fake.pdf', type: 'application/pdf', bytes: Buffer.from('hello') },
		)
		expect(spoofed.status).toBe(415)
	})

	it('routes only to agents and pauses, resolves and closes on the service level clock', /** REQ-HR-SERVICE-DESK-004, -005. */ async () => {
		const created = await raise('Holiday party')
		const notAgent = await api.send<Reply>('toby', 'POST', path(created.id, 'assignment'), {
			teamId: TEAM,
			assigneeAccountId: 'dunder-mifflin/account/jim',
			reason: 'Try Jim.',
			expectedRevision: created.revision,
		})
		expect(notAgent.status).toBe(400)
		expect(notAgent.body.fieldErrors).toEqual([{ field: 'assigneeAccountId', code: 'not-agent' }])
		const assigned = await api.send<Reply>('toby', 'POST', path(created.id, 'assignment'), {
			teamId: TEAM,
			assigneeAccountId: TOBY,
			reason: 'I will take it.',
			expectedRevision: created.revision,
		})
		expect(assigned.status, JSON.stringify(assigned.body)).toBe(200)
		expect(assigned.body.assignee?.accountId).toBe(TOBY)
		const mine = await api.send<HrServiceRequestPage>(
			'toby',
			'GET',
			`${base}/requests?view=assigned`,
		)
		expect(mine.body.items.map(/** Id. */ (item) => item.id)).toContain(created.id)
		const skipped = await move(assigned.body, 'Closed')
		expect(skipped.status).toBe(409)
		const waiting = await move(assigned.body, 'WaitingForEmployee', {
			reason: 'Which date suits you?',
		})
		expect(waiting.status, JSON.stringify(waiting.body)).toBe(200)
		expect(waiting.body.slaState).toBe('Paused')
		const unresolved = await move(waiting.body, 'Resolved')
		expect(unresolved.status).toBe(400)
		const resolved = await move(waiting.body, 'Resolved', {
			resolutionCode: 'Answered',
			resolutionSummary: 'The party is on Friday.',
		})
		expect(resolved.status, JSON.stringify(resolved.body)).toBe(200)
		expect(resolved.body).toMatchObject({
			status: 'Resolved',
			resolutionCode: 'Answered',
			slaState: 'Met',
		})
		expect(resolved.body.reopenUntil).not.toBeNull()
		expect(resolved.body.targets.every(/** Met. */ (t) => t.metAt && !t.pausedAt)).toBe(true)
		const closed = await move(resolved.body, 'Closed')
		expect(closed.body).toMatchObject({
			status: 'Closed',
			actions: { reply: false, transitions: [] },
		})
		const late = await api.upload<Reply>('toby', path(created.id, 'messages'), {
			visibility: 'Internal',
			body: 'Too late.',
			expectedRevision: closed.body.revision,
		})
		expect(late.status).toBe(409)
		const messages = await api.send<HrServiceMessagePage>(
			'toby',
			'GET',
			path(created.id, 'messages'),
		)
		expect(
			messages.body.items.filter(/** Status updates. */ (m) => m.kind === 'StatusUpdate'),
		).toHaveLength(3)
	})

	it('versions service levels and validates configuration references', /** REQ-HR-SERVICE-DESK-006. */ async () => {
		const targets = {
			P1: { firstResponse: 60, resolution: 480 },
			P2: { firstResponse: 240, resolution: 960 },
			P3: { firstResponse: 480, resolution: 1440 },
			P4: { firstResponse: 960, resolution: 2880 },
		}
		const draft = await api.send<Record<string, unknown>>(
			'toby',
			'POST',
			`${base}/configuration/service-levels`,
			{
				code: 'express',
				name: 'Express',
				targets,
				reason: 'Faster answers for managers.',
			},
		)
		expect(draft.status, JSON.stringify(draft.body)).toBe(201)
		expect(draft.body).toMatchObject({ code: 'express', versionNumber: 1, status: 'Draft' })
		const early = await api.send<Record<string, unknown>>(
			'toby',
			'POST',
			`${base}/configuration/request-types`,
			{
				code: 'manager-question',
				name: 'Manager question',
				category: 'General',
				audience: 'Employee',
				defaultTeamId: TEAM,
				serviceLevelCode: 'express',
				defaultPriority: 'P3',
				reason: 'Managers ask differently.',
			},
		)
		expect(early.status).toBe(400)
		const published = await api.send<Record<string, unknown>>(
			'toby',
			'PUT',
			`${base}/configuration/service-levels/${encodeURIComponent(String(draft.body['id']))}`,
			{ status: 'Published', reason: 'Approved.', expectedRevision: draft.body['revision'] },
		)
		expect(published.status, JSON.stringify(published.body)).toBe(200)
		expect(published.body['status']).toBe('Published')
		const frozen = await api.send<Record<string, unknown>>(
			'toby',
			'PUT',
			`${base}/configuration/service-levels/${encodeURIComponent(String(draft.body['id']))}`,
			{ name: 'Renamed', reason: 'Try.', expectedRevision: published.body['revision'] },
		)
		expect(frozen.status).toBe(409)
		const type = await api.send<Record<string, unknown>>(
			'toby',
			'POST',
			`${base}/configuration/request-types`,
			{
				code: 'manager-question',
				name: 'Manager question',
				category: 'General',
				audience: 'Employee',
				defaultTeamId: TEAM,
				serviceLevelCode: 'express',
				defaultPriority: 'P3',
				reason: 'Managers ask differently.',
			},
		)
		expect(type.status, JSON.stringify(type.body)).toBe(201)
		const member = await api.send<Record<string, unknown>>(
			'toby',
			'POST',
			`${base}/configuration/memberships`,
			{
				teamId: TEAM,
				accountId: 'dunder-mifflin/account/jim',
				memberRole: 'Agent',
				reason: 'Jim helps.',
			},
		)
		expect(member.status).toBe(400)
		const teams = await api.send<HrServiceConfigPage>('toby', 'GET', `${base}/configuration/teams`)
		expect(teams.body.items).toMatchObject([{ id: TEAM, memberCount: 1 }])
	})

	it('refuses callers without the desk permission', /** Authorization. */ async () => {
		expect((await api.send('jim', 'GET', `${base}/requests`)).status).toBe(403)
		expect((await api.send('jim', 'GET', `${base}/configuration/teams`)).status).toBe(403)
	})
})
