import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type {
	HrServiceMessageSelfPage,
	HrServiceRequestDto,
	HrServiceRequestSelfDto,
	HrServiceRequestSelfPage,
	RequestTypeOptionDto,
} from '@empflowyee/hcm-employee-contract'
import { HcmEmployeeModule } from './hcm-api-employee-module'
import { startHcmTestApi, type HcmTestApi } from './employee-test-harness'

let api: HcmTestApi
const base = 'employee/me/hr-requests'
const desk = 'employee/hr-service/requests'
const QUESTION = 'dunder-mifflin/hr-request-type/general-question'
const CONCERN = 'dunder-mifflin/hr-request-type/workplace-concern'
const PNG = Buffer.concat([
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	Buffer.alloc(32),
])
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n')
type Self = HrServiceRequestSelfDto & {
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

/** An encoded own request path. */
function path(id: string, op = ''): string {
	return `${base}/${encodeURIComponent(id)}${op ? '/' + op : ''}`
}

/** An encoded desk request path. */
function deskPath(id: string, op = ''): string {
	return `${desk}/${encodeURIComponent(id)}${op ? '/' + op : ''}`
}

/** Raise a general question as Jim. */
async function raise(
	subject: string,
	file?: { name: string; type: string; bytes: Buffer },
): Promise<Self> {
	const reply = await api.upload<Self>(
		'jim',
		base,
		{ typeId: QUESTION, subject, description: 'Who approves parking changes?' },
		file,
	)
	expect(reply.status, JSON.stringify(reply.body)).toBe(201)
	return reply.body
}

/** Read a request as Toby on the desk. */
async function deskRead(id: string): Promise<HrServiceRequestDto> {
	return (await api.send<HrServiceRequestDto>('toby', 'GET', deskPath(id))).body
}

/** Move a request as Toby on the desk. */
async function deskMove(id: string, status: string, extra: Record<string, unknown> = {}) {
	const current = await deskRead(id)
	const reply = await api.send<HrServiceRequestDto>('toby', 'POST', deskPath(id, 'status'), {
		status,
		expectedRevision: current.revision,
		...extra,
	})
	expect(reply.status, JSON.stringify(reply.body)).toBe(200)
}

describe('My HR Requests', /** My HR Requests TDD#API. */ () => {
	it('offers employee types only and raises a request with an attachment', /** REQ-MY-HR-REQUESTS-001. */ async () => {
		const types = await api.send<{ items: RequestTypeOptionDto[] }>(
			'jim',
			'GET',
			'employee/me/hr-request-types',
		)
		expect(types.body.items.map(/** Code. */ (t) => t.code)).toEqual([
			'personal-data-correction',
			'general-question',
			'pay-question',
			'employment-letter',
		])
		const concern = await api.upload<Self>('jim', base, {
			typeId: CONCERN,
			subject: 'Concern',
			description: 'Not for employees.',
		})
		expect(concern.status).toBe(400)
		const created = await raise('Parking badge', {
			name: 'badge.png',
			type: 'image/png',
			bytes: PNG,
		})
		expect(created).toMatchObject({
			status: 'New',
			typeName: 'General question',
			actions: { reply: true, cancel: true, reopen: false },
		})
		expect(created.requestNumber).toMatch(/^HR-\d{6}$/)
		expect(Object.keys(created)).not.toContain('assignee')
		expect(Object.keys(created)).not.toContain('targets')
		const list = await api.send<HrServiceRequestSelfPage>('jim', 'GET', `${base}?view=open`)
		expect(list.body.items.map(/** Id. */ (item) => item.id)).toContain(created.id)
		expect((await deskRead(created.id)).priority).toBe('P4')
	})

	it('hides internal content and other requesters', /** REQ-MY-HR-REQUESTS-002, -005. */ async () => {
		const created = await raise('Desk lamp')
		const noted = await api.upload<HrServiceRequestDto>(
			'toby',
			deskPath(created.id, 'messages'),
			{
				visibility: 'Internal',
				body: 'Check the budget.',
				expectedRevision: (await deskRead(created.id)).revision,
			},
			{ name: 'budget.pdf', type: 'application/pdf', bytes: PDF },
		)
		expect(noted.status, JSON.stringify(noted.body)).toBe(200)
		const replied = await api.upload<HrServiceRequestDto>(
			'toby',
			deskPath(created.id, 'messages'),
			{
				visibility: 'EmployeeVisible',
				body: 'A lamp is on its way.',
				expectedRevision: noted.body.revision,
			},
		)
		expect(replied.status).toBe(200)
		const messages = await api.send<HrServiceMessageSelfPage>(
			'jim',
			'GET',
			path(created.id, 'messages'),
		)
		expect(
			messages.body.items.map(/** Author and body. */ (m) => `${m.author}: ${m.body}`),
		).toEqual(['You: Who approves parking changes?', 'HR: A lamp is on its way.'])
		expect(JSON.stringify(messages.body)).not.toContain('budget')
		const internal = noted.body.attachments[0]?.id ?? ''
		expect(
			(await api.send('jim', 'GET', path(created.id, `attachments/${internal}/download`))).status,
		).toBe(404)
		expect((await api.send('michael', 'GET', path(created.id))).status).toBe(404)
		expect((await api.send('michael', 'GET', path(created.id, 'messages'))).status).toBe(404)
	})

	it('hands a reply back to HR and downloads own attachments', /** REQ-MY-HR-REQUESTS-002. */ async () => {
		const created = await raise('Parking spot', { name: 'spot.png', type: 'image/png', bytes: PNG })
		await deskMove(created.id, 'WaitingForEmployee', { reason: 'Which floor?' })
		const current = (await api.send<Self>('jim', 'GET', path(created.id))).body
		expect(current.status).toBe('WaitingForEmployee')
		const reply = await api.upload<Self>('jim', path(created.id, 'messages'), {
			body: 'The second floor.',
			expectedRevision: current.revision,
		})
		expect(reply.status, JSON.stringify(reply.body)).toBe(200)
		expect(reply.body.status).toBe('WaitingForHr')
		const messages = await api.send<HrServiceMessageSelfPage>(
			'jim',
			'GET',
			path(created.id, 'messages'),
		)
		const attachment = messages.body.items[0]?.attachments[0]
		expect(attachment?.fileName).toBe('spot.png')
		const file = await api.send<string>(
			'jim',
			'GET',
			path(created.id, `attachments/${attachment?.id}/download`),
		)
		expect(file.status).toBe(200)
	})

	it('cancels open requests and reopens resolved ones within 7 days only', /** REQ-MY-HR-REQUESTS-003. */ async () => {
		const first = await raise('Wrong question')
		const cancelled = await api.send<Self>('jim', 'POST', path(first.id, 'cancel'), {
			reason: 'Asked by mistake.',
			expectedRevision: first.revision,
		})
		expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
		expect(cancelled.body).toMatchObject({
			status: 'Cancelled',
			cancelReason: 'Asked by mistake.',
			actions: { reply: false },
		})
		const late = await api.upload<Self>('jim', path(first.id, 'messages'), {
			body: 'Hello?',
			expectedRevision: cancelled.body.revision,
		})
		expect(late.status).toBe(409)

		const second = await raise('Holiday party')
		await deskMove(second.id, 'Resolved', {
			resolutionCode: 'Answered',
			resolutionSummary: 'It is on Friday.',
		})
		const resolved = (await api.send<Self>('jim', 'GET', path(second.id))).body
		expect(resolved.actions).toMatchObject({ reopen: true, cancel: false })
		expect(resolved.reopenUntil).not.toBeNull()
		const cancel = await api.send<Self>('jim', 'POST', path(second.id, 'cancel'), {
			reason: 'No.',
			expectedRevision: resolved.revision,
		})
		expect(cancel.status).toBe(409)
		const reopened = await api.send<Self>('jim', 'POST', path(second.id, 'reopen'), {
			reason: 'Which Friday?',
			expectedRevision: resolved.revision,
		})
		expect(reopened.status, JSON.stringify(reopened.body)).toBe(200)
		expect(reopened.body.status).toBe('Open')

		const third = await raise('Old answer')
		await deskMove(third.id, 'Resolved', { resolutionCode: 'Answered', resolutionSummary: 'Done.' })
		await api.admin.query(
			"UPDATE hcm.hr_service_request SET resolved_at=resolved_at - interval '8 days' WHERE id=$1",
			[third.id],
		)
		const stale = (await api.send<Self>('jim', 'GET', path(third.id))).body
		expect(stale.actions.reopen).toBe(false)
		const day8 = await api.send<Self>('jim', 'POST', path(third.id, 'reopen'), {
			reason: 'Too late.',
			expectedRevision: stale.revision,
		})
		expect(day8.status).toBe(409)
	})
})
