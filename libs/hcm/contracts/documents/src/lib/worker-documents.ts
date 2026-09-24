import {
	DocumentError,
	documentBodyFields,
	documentId,
	documentText,
} from './hcm-documents-contract'
import { parseTemplateQuery, type TemplateQuery, type DocumentVersion } from './document-templates'
export interface WorkerChoice {
	id: string
	displayName: string
	workerCode: string
}
export interface WorkerQuery {
	q: string
	limit: number
	cursor?: string
}
export interface WorkerDocument {
	id: string
	workerId: string
	typeId: string
	label: string
	revision: number
}
export interface WorkerDocumentVersion extends DocumentVersion {
	revision: number
	employeeVisible: boolean
}
export interface WorkerDocumentQuery extends TemplateQuery {
	workerId?: string
}
export interface WorkerDocumentCreate {
	workerId: string
	typeId: string
	label: string
	employeeVisible: boolean
	reason: string
}
export interface WorkerDocumentAppend {
	employeeVisible: boolean
	expectedRevision: number
	reason: string
}
export interface WorkerUploadResult {
	document: WorkerDocument
	version: WorkerDocumentVersion
}
/** Parse real-worker search without accepting hidden sort or subject controls. */
export function parseWorkerQuery(params: URLSearchParams): WorkerQuery {
	for (const key of params.keys())
		if (!['q', 'limit', 'cursor'].includes(key)) throw new DocumentError('invalid-request')
	const query = parseTemplateQuery(params)
	return { q: query.q, limit: query.limit, cursor: query.cursor }
}
/** Keep worker filtering explicit and tenant-free. */
export function parseWorkerDocumentQuery(params: URLSearchParams): WorkerDocumentQuery {
	if (params.getAll('workerId').length > 1) throw new DocumentError('invalid-request')
	const copy = new URLSearchParams(params),
		workerId = copy.get('workerId')
	copy.delete('workerId')
	return {
		...parseTemplateQuery(copy),
		...(workerId !== null ? { workerId: documentId(workerId) } : {}),
	}
}
/** Require an explicit boolean; absence never silently shares a version. */
function visibility(value: unknown): boolean {
	if (typeof value !== 'boolean') throw new DocumentError('invalid-request')
	return value
}
/** Validate a bounded worker-linked create before receiving any bytes. */
export function parseWorkerDocumentCreate(body: unknown): WorkerDocumentCreate {
	const v = documentBodyFields(body, ['workerId', 'typeId', 'label', 'employeeVisible', 'reason'])
	return {
		workerId: documentId(v['workerId'] as string),
		typeId: documentId(v['typeId'] as string),
		label: documentText(v['label'], 150),
		employeeVisible: visibility(v['employeeVisible']),
		reason: documentText(v['reason'], 500),
	}
}
/** Use the same focused payload for append and single-version sharing commands. */
export function parseWorkerDocumentAppend(body: unknown): WorkerDocumentAppend {
	const v = documentBodyFields(body, ['employeeVisible', 'expectedRevision', 'reason'])
	if (!Number.isSafeInteger(v['expectedRevision']) || Number(v['expectedRevision']) < 1)
		throw new DocumentError('invalid-request')
	return {
		employeeVisible: visibility(v['employeeVisible']),
		expectedRevision: Number(v['expectedRevision']),
		reason: documentText(v['reason'], 500),
	}
}
