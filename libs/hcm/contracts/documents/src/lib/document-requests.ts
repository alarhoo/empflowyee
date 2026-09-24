import {
	DocumentError,
	documentBodyFields,
	documentId,
	documentText,
	parseDocumentTypeQuery,
} from './hcm-documents-contract'
export type DocumentRequestStatus = 'Open' | 'Submitted' | 'Completed' | 'Cancelled'
export type DocumentRequestScope = 'hr' | 'own'
export interface DocumentRequest {
	id: string
	typeId: string
	workerId: string
	status: DocumentRequestStatus
	dueDate: string | null
	instructions: string
	revision: number
	createdAt: string
	requestedByAccountId: string
	acceptedVersionId: string | null
}
export interface SelfDocumentRequest {
	id: string
	typeId: string
	status: DocumentRequestStatus
	dueDate: string | null
	instructions: string
	revision: number
	createdAt: string
	requesterDisplayName: string
	acceptedVersionId: string | null
}
export type RequestView = DocumentRequest | SelfDocumentRequest
export interface DocumentRequestQuery {
	q: string
	workerId?: string
	typeId?: string
	status?: DocumentRequestStatus
	sort: 'createdAt:asc' | 'createdAt:desc'
	limit: number
	cursor?: string
}
export interface DocumentRequestCreate {
	workerId: string
	typeId: string
	instructions: string
	dueDate: string | null
	reason: string
}
export interface DocumentRequestTransition {
	expectedRevision: number
	reason: string
	submissionId?: string
}
export interface DocumentRequestSubmit {
	expectedRevision: number
}
/** Validate a real calendar date without silently normalizing invalid dates. */
function dueDate(value: unknown): string | null {
	if (value === undefined || value === null) return null
	if (
		typeof value !== 'string' ||
		!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
		Number(value.slice(0, 4)) < 1
	)
		throw new DocumentError('invalid-request')
	const parsed = new Date(value + 'T00:00:00Z')
	if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
		throw new DocumentError('invalid-request')
	return value
}
/** Require a positive aggregate revision for every state-changing command. */
function revision(value: unknown): number {
	if (!Number.isSafeInteger(value) || Number(value) < 1) throw new DocumentError('invalid-request')
	return Number(value)
}
/** Parse only approved HR creation fields and informational due date. */
export function parseDocumentRequestCreate(body: unknown): DocumentRequestCreate {
	const v = documentBodyFields(body, ['workerId', 'typeId', 'reason'], ['instructions', 'dueDate'])
	return {
		workerId: documentId(v['workerId'] as string),
		typeId: documentId(v['typeId'] as string),
		reason: documentText(v['reason'], 500),
		instructions:
			v['instructions'] === undefined ? '' : documentText(v['instructions'], 1000, false),
		dueDate: dueDate(v['dueDate']),
	}
}
/** Require exact action metadata; only acceptance may name a submission. */
export function parseDocumentRequestTransition(
	body: unknown,
	action: 'accept' | 'replacement' | 'cancel',
): DocumentRequestTransition {
	const v = documentBodyFields(
		body,
		action === 'accept'
			? ['submissionId', 'expectedRevision', 'reason']
			: ['expectedRevision', 'reason'],
	)
	return {
		expectedRevision: revision(v['expectedRevision']),
		reason: documentText(v['reason'], 500),
		...(action === 'accept' ? { submissionId: documentId(v['submissionId'] as string) } : {}),
	}
}
/** The addressed employee supplies no actor, worker, state or visibility override. */
export function parseDocumentRequestSubmit(body: unknown): DocumentRequestSubmit {
	const v = documentBodyFields(body, ['expectedRevision'])
	return { expectedRevision: revision(v['expectedRevision']) }
}
/** Keep HR filters separate from the self endpoint's allowed status filter. */
export function parseDocumentRequestQuery(
	params: URLSearchParams,
	scope: DocumentRequestScope,
): DocumentRequestQuery {
	const allowed = [
		'q',
		'sort',
		'limit',
		'cursor',
		'status',
		...(scope === 'hr' ? ['workerId', 'typeId'] : []),
	]
	for (const key of params.keys())
		if (!allowed.includes(key) || params.getAll(key).length !== 1)
			throw new DocumentError('invalid-request')
	const sort = params.get('sort') ?? 'createdAt:desc',
		status = params.get('status')
	if (
		!['createdAt:asc', 'createdAt:desc'].includes(sort) ||
		(status !== null && !['Open', 'Submitted', 'Completed', 'Cancelled'].includes(status))
	)
		throw new DocumentError('invalid-request')
	const paging = new URLSearchParams(params)
	for (const key of ['sort', 'status', 'workerId', 'typeId']) paging.delete(key)
	const q = parseDocumentTypeQuery(paging)
	return {
		q: q.q,
		sort: sort as DocumentRequestQuery['sort'],
		limit: q.limit,
		cursor: q.cursor,
		...(status ? { status: status as DocumentRequestStatus } : {}),
		...(params.has('workerId') ? { workerId: documentId(params.get('workerId')!) } : {}),
		...(params.has('typeId') ? { typeId: documentId(params.get('typeId')!) } : {}),
	}
}
