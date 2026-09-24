import {
	DocumentError,
	documentBodyFields,
	documentId,
	documentText,
	parseDocumentTypeQuery,
} from './hcm-documents-contract'
export interface DocumentTemplate {
	id: string
	typeId: string
	label: string
	revision: number
}
export interface DocumentVersion {
	id: string
	versionNumber: number
	filename: string
	mediaType: string
	byteLength: number
	createdAt: string
}
export interface DocumentPage<T> {
	items: T[]
	nextCursor: string | null
}
export interface TemplateQuery {
	q: string
	typeId?: string
	sort: 'label:asc' | 'label:desc'
	limit: number
	cursor?: string
}
export interface VersionQuery {
	sort: 'versionNumber:desc'
	limit: number
	cursor?: string
}
export interface TemplateCreate {
	typeId: string
	label: string
	reason: string
}
export interface TemplateAppend {
	expectedRevision: number
	reason: string
}
export interface TemplateUploadResult {
	template: DocumentTemplate
	version: DocumentVersion
}
/** Reject extra multipart metadata fields before accepting any bytes. */
export function parseTemplateCreate(body: unknown): TemplateCreate {
	const value = documentBodyFields(body, ['typeId', 'label', 'reason'])
	return {
		typeId: documentId(value['typeId'] as string),
		label: documentText(value['label'], 100),
		reason: documentText(value['reason'], 500),
	}
}
/** Keep immutable type and label out of version append metadata. */
export function parseTemplateAppend(body: unknown): TemplateAppend {
	const value = documentBodyFields(body, ['expectedRevision', 'reason'])
	if (!Number.isSafeInteger(value['expectedRevision']) || Number(value['expectedRevision']) < 1)
		throw new DocumentError('invalid-request')
	return {
		expectedRevision: Number(value['expectedRevision']),
		reason: documentText(value['reason'], 500),
	}
}
/** Parse template filters without accepting classification-only fields. */
export function parseTemplateQuery(params: URLSearchParams): TemplateQuery {
	if (params.has('enabled') || params.getAll('typeId').length > 1)
		throw new DocumentError('invalid-request')
	const copy = new URLSearchParams(params),
		typeId = copy.get('typeId')
	copy.delete('typeId')
	const query = parseDocumentTypeQuery(copy)
	return {
		q: query.q,
		sort: query.sort,
		limit: query.limit,
		cursor: query.cursor,
		...(typeId !== null ? { typeId: documentId(typeId) } : {}),
	}
}
/** Allow only stable descending version pagination, not hidden free-text search or arbitrary ordering. */
export function parseVersionQuery(params: URLSearchParams): VersionQuery {
	for (const key of params.keys())
		if (!['sort', 'limit', 'cursor'].includes(key) || params.getAll(key).length !== 1)
			throw new DocumentError('invalid-request')
	if (params.has('sort') && params.get('sort') !== 'versionNumber:desc')
		throw new DocumentError('invalid-request')
	const copy = new URLSearchParams(params)
	copy.delete('sort')
	const query = parseDocumentTypeQuery(copy)
	return { sort: 'versionNumber:desc', limit: query.limit, cursor: query.cursor }
}
