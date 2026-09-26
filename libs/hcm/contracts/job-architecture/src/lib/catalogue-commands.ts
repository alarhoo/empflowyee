import {
	boolValue,
	codeValue,
	dateValue,
	enumValue,
	idValue,
	intValue,
	invalidField,
	optionalText,
	readBody,
	readListQuery,
	revisionValue,
	textValue,
} from '@empflowyee/hcm-runtime-contract'
import {
	ARCHITECTURE_STATUSES,
	CATALOGUE_ELEMENT_KINDS,
	QUANTITY_UNITS,
	REQUIREMENT_TYPES,
	TRACK_KINDS,
	type ArchitectureStatus,
	type CatalogueElementKind,
	type QuantityUnit,
	type RequirementType,
	type TrackKind,
} from './catalogue'

/** Most responsibilities, requirements and allowed grades in one profile version. */
export const MAX_PROFILE_ITEMS = 50

export interface ReasonedCommand {
	reason: string
}
export interface RevisionedCommand extends ReasonedCommand {
	expectedRevision: number
}

export interface CatalogueVersionCreate extends ReasonedCommand {
	basedOnVersionId: string
	changeSummary: string
}

/** Fields every catalogue element carries. */
export interface ElementFields {
	name: string
	description: string
}
export interface FamilyCreate extends ElementFields {
	kind: 'families'
	code: string
	parentId: string | null
	sortOrder: number
}
export interface TrackCreate extends ElementFields {
	kind: 'tracks'
	code: string
	trackKind: TrackKind
	sortOrder: number
}
export interface LevelCreate extends ElementFields {
	kind: 'levels'
	code: string
	trackId: string
	sequence: number
	scopeSummary: string
}
export interface BandCreate extends ElementFields {
	kind: 'bands'
	code: string
	sequence: number
}
export interface GradeCreate extends ElementFields {
	kind: 'grades'
	code: string
	bandId: string
	sequence: number
}
export type ElementCreate = FamilyCreate | TrackCreate | LevelCreate | BandCreate | GradeCreate
export type ElementUpdate = ElementFields & {
	kind: CatalogueElementKind
	active: boolean
	sortOrder?: number
	sequence?: number
	scopeSummary?: string
}

export interface PublishCommand extends RevisionedCommand {
	effectiveFrom: string
}

export interface ResponsibilityInput {
	code: string
	statement: string
	essential: boolean
	sortOrder: number
}
export interface RequirementInput {
	code: string
	type: RequirementType
	name: string
	description: string
	proficiency: string
	minimumQuantity: number | null
	unit: QuantityUnit | null
	mandatory: boolean
	sortOrder: number
}
/** The editable content of a draft job profile version. */
export interface JobProfileVersionDraft {
	catalogueVersionId: string
	familyId: string
	trackId: string
	levelId: string
	summary: string
	purpose: string
	scopeOfImpact: string
	autonomyLevel: string
	responsibilities: ResponsibilityInput[]
	requirements: RequirementInput[]
	allowedGrades: { gradeId: string; isDefault: boolean }[]
}
export interface ProfileCreate extends ReasonedCommand {
	code: string
	name: string
	draft: JobProfileVersionDraft
}
export interface ProfileVersionCreate extends ReasonedCommand {
	basedOnVersionId: string
}
export interface ProfileDraftUpdate extends RevisionedCommand {
	draft: JobProfileVersionDraft
}

export interface FamilyQuery {
	parentId: string | null
	limit: number
	cursor?: string
}
export interface ProfileQuery {
	q: string
	familyId?: string
	status?: ArchitectureStatus
	limit: number
	cursor?: string
}

/** Parse an explicit reason for change. */
function reasonValue(value: unknown): string {
	return textValue(value, 'reason', 500).trim()
}

/** Parse a sort order or sequence within bounds. */
function orderValue(value: unknown, field: string, min: number, max: number): number {
	return intValue(value, field, min, max)
}

/** Parse the element kind path segment. */
export function parseElementKind(kind: string): CatalogueElementKind {
	return enumValue(kind, 'elementKind', CATALOGUE_ELEMENT_KINDS)
}

/** Parse a draft successor of a published catalogue version. */
export function parseCatalogueVersionCreate(body: unknown): CatalogueVersionCreate {
	const v = readBody(body, ['basedOnVersionId', 'changeSummary', 'reason'])
	return {
		basedOnVersionId: idValue(v['basedOnVersionId'], 'basedOnVersionId'),
		changeSummary: textValue(v['changeSummary'], 'changeSummary', 500).trim(),
		reason: reasonValue(v['reason']),
	}
}

/** Parse a new catalogue element of the given kind. */
export function parseElementCreate(kind: string, body: unknown): ElementCreate & RevisionedCommand {
	const element = parseElementKind(kind)
	const extra: Record<CatalogueElementKind, string[]> = {
		families: ['parentId', 'sortOrder'],
		tracks: ['kind', 'sortOrder'],
		levels: ['trackId', 'sequence', 'scopeSummary'],
		bands: ['sequence'],
		grades: ['bandId', 'sequence'],
	}
	const v = readBody(
		body,
		['code', 'name', 'expectedRevision', 'reason'],
		['description', ...extra[element]],
	)
	const base = {
		code: codeValue(v['code'], 'code'),
		name: textValue(v['name'], 'name', 100).trim(),
		description: optionalText(v['description'], 'description', 500).trim(),
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: reasonValue(v['reason']),
	}
	switch (element) {
		case 'families':
			return {
				...base,
				kind: 'families',
				parentId:
					v['parentId'] === undefined || v['parentId'] === null
						? null
						: idValue(v['parentId'], 'parentId'),
				sortOrder:
					v['sortOrder'] === undefined ? 0 : orderValue(v['sortOrder'], 'sortOrder', 0, 9999),
			}
		case 'tracks':
			return {
				...base,
				kind: 'tracks',
				trackKind: enumValue(v['kind'], 'kind', TRACK_KINDS),
				sortOrder:
					v['sortOrder'] === undefined ? 0 : orderValue(v['sortOrder'], 'sortOrder', 0, 9999),
			}
		case 'levels':
			return {
				...base,
				kind: 'levels',
				trackId: idValue(v['trackId'], 'trackId'),
				sequence: orderValue(v['sequence'], 'sequence', 1, 99),
				scopeSummary: optionalText(v['scopeSummary'], 'scopeSummary', 500).trim(),
			}
		case 'bands':
			return { ...base, kind: 'bands', sequence: orderValue(v['sequence'], 'sequence', 1, 99) }
		default:
			return {
				...base,
				kind: 'grades',
				bandId: idValue(v['bandId'], 'bandId'),
				sequence: orderValue(v['sequence'], 'sequence', 1, 99),
			}
	}
}

/** Parse an element edit, retirement or reactivation; codes and parents never change. */
export function parseElementUpdate(kind: string, body: unknown): ElementUpdate & RevisionedCommand {
	const element = parseElementKind(kind)
	const ordered = element === 'families' || element === 'tracks'
	const v = readBody(
		body,
		['name', 'active', 'expectedRevision', 'reason', ordered ? 'sortOrder' : 'sequence'],
		['description', ...(element === 'levels' ? ['scopeSummary'] : [])],
	)
	return {
		kind: element,
		name: textValue(v['name'], 'name', 100).trim(),
		description: optionalText(v['description'], 'description', 500).trim(),
		active: boolValue(v['active'], 'active'),
		...(ordered
			? { sortOrder: orderValue(v['sortOrder'], 'sortOrder', 0, 9999) }
			: { sequence: orderValue(v['sequence'], 'sequence', 1, 99) }),
		...(element === 'levels'
			? { scopeSummary: optionalText(v['scopeSummary'], 'scopeSummary', 500).trim() }
			: {}),
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: reasonValue(v['reason']),
	}
}

/** Parse a submission for review. */
export function parseSubmit(body: unknown): RevisionedCommand {
	const v = readBody(body, ['expectedRevision', 'reason'])
	return {
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: reasonValue(v['reason']),
	}
}

/** Parse a publication with its effective date. */
export function parsePublish(body: unknown): PublishCommand {
	const v = readBody(body, ['effectiveFrom', 'expectedRevision', 'reason'])
	return {
		effectiveFrom: dateValue(v['effectiveFrom'], 'effectiveFrom'),
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: reasonValue(v['reason']),
	}
}

/** Parse one responsibility. */
function responsibility(value: unknown, field: string): ResponsibilityInput {
	const v = readBody(value, ['code', 'statement'], ['essential', 'sortOrder'])
	return {
		code: codeValue(v['code'], `${field}.code`),
		statement: textValue(v['statement'], `${field}.statement`, 1000).trim(),
		essential:
			v['essential'] === undefined ? true : boolValue(v['essential'], `${field}.essential`),
		sortOrder:
			v['sortOrder'] === undefined ? 0 : orderValue(v['sortOrder'], `${field}.sortOrder`, 0, 9999),
	}
}

/** Parse one requirement; a quantity always carries its unit. */
function requirement(value: unknown, field: string): RequirementInput {
	const v = readBody(
		value,
		['code', 'type', 'name'],
		['description', 'proficiency', 'minimumQuantity', 'unit', 'mandatory', 'sortOrder'],
	)
	const quantity = v['minimumQuantity'] ?? null
	const unit = v['unit'] ?? null
	if (
		quantity !== null &&
		(typeof quantity !== 'number' ||
			!Number.isFinite(quantity) ||
			quantity < 0 ||
			quantity > 999999)
	)
		invalidField(`${field}.minimumQuantity`)
	if ((quantity === null) !== (unit === null)) invalidField(`${field}.unit`, 'quantity-unit')
	return {
		code: codeValue(v['code'], `${field}.code`),
		type: enumValue(v['type'], `${field}.type`, REQUIREMENT_TYPES),
		name: textValue(v['name'], `${field}.name`, 150).trim(),
		description: optionalText(v['description'], `${field}.description`, 1000).trim(),
		proficiency: optionalText(v['proficiency'], `${field}.proficiency`, 100).trim(),
		minimumQuantity: quantity === null ? null : Math.round((quantity as number) * 100) / 100,
		unit: unit === null ? null : enumValue(unit, `${field}.unit`, QUANTITY_UNITS),
		mandatory:
			v['mandatory'] === undefined ? true : boolValue(v['mandatory'], `${field}.mandatory`),
		sortOrder:
			v['sortOrder'] === undefined ? 0 : orderValue(v['sortOrder'], `${field}.sortOrder`, 0, 9999),
	}
}

/** Parse a bounded array of items. */
function items<T>(value: unknown, field: string, parse: (item: unknown, path: string) => T): T[] {
	if (!Array.isArray(value) || value.length > MAX_PROFILE_ITEMS) invalidField(field)
	return (value as unknown[]).map(
		/** One item. */ (item, index) => parse(item, `${field}.${index}`),
	)
}

/** Parse the editable content of a draft profile version. */
export function parseProfileDraft(value: unknown): JobProfileVersionDraft {
	const v = readBody(
		value,
		['catalogueVersionId', 'familyId', 'trackId', 'levelId', 'allowedGrades'],
		['summary', 'purpose', 'scopeOfImpact', 'autonomyLevel', 'responsibilities', 'requirements'],
	)
	return {
		catalogueVersionId: idValue(v['catalogueVersionId'], 'catalogueVersionId'),
		familyId: idValue(v['familyId'], 'familyId'),
		trackId: idValue(v['trackId'], 'trackId'),
		levelId: idValue(v['levelId'], 'levelId'),
		summary: optionalText(v['summary'], 'summary', 500).trim(),
		purpose: optionalText(v['purpose'], 'purpose', 2000).trim(),
		scopeOfImpact: optionalText(v['scopeOfImpact'], 'scopeOfImpact', 2000).trim(),
		autonomyLevel: optionalText(v['autonomyLevel'], 'autonomyLevel', 500).trim(),
		responsibilities: items(v['responsibilities'] ?? [], 'responsibilities', responsibility),
		requirements: items(v['requirements'] ?? [], 'requirements', requirement),
		allowedGrades: items(
			v['allowedGrades'],
			'allowedGrades',
			/** One allowed grade. */ (item, path) => {
				const g = readBody(item, ['gradeId', 'isDefault'])
				return {
					gradeId: idValue(g['gradeId'], `${path}.gradeId`),
					isDefault: boolValue(g['isDefault'], `${path}.isDefault`),
				}
			},
		),
	}
}

/** Parse a new job profile with its first draft version. */
export function parseProfileCreate(body: unknown): ProfileCreate {
	const v = readBody(body, ['code', 'name', 'draft', 'reason'])
	return {
		code: codeValue(v['code'], 'code'),
		name: textValue(v['name'], 'name', 100).trim(),
		draft: parseProfileDraft(v['draft']),
		reason: reasonValue(v['reason']),
	}
}

/** Parse a draft successor of a profile version. */
export function parseProfileVersionCreate(body: unknown): ProfileVersionCreate {
	const v = readBody(body, ['basedOnVersionId', 'reason'])
	return {
		basedOnVersionId: idValue(v['basedOnVersionId'], 'basedOnVersionId'),
		reason: reasonValue(v['reason']),
	}
}

/** Parse a replacement of a draft profile version's content. */
export function parseProfileDraftUpdate(body: unknown): ProfileDraftUpdate {
	const v = readBody(body, ['draft', 'expectedRevision', 'reason'])
	return {
		draft: parseProfileDraft(v['draft']),
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: reasonValue(v['reason']),
	}
}

/** Parse a family page query. */
export function parseFamilyQuery(params: URLSearchParams): FamilyQuery {
	const query = readListQuery(params, ['sortOrder:asc'], ['parentId'])
	const parent = query.filters['parentId']
	return {
		parentId: parent === undefined ? null : idValue(parent, 'parentId'),
		limit: query.limit,
		...(query.cursor ? { cursor: query.cursor } : {}),
	}
}

/** Parse a profile page query. */
export function parseProfileQuery(params: URLSearchParams): ProfileQuery {
	const query = readListQuery(params, ['name:asc'], ['familyId', 'status'])
	const family = query.filters['familyId']
	const status = query.filters['status']
	return {
		q: query.q,
		limit: query.limit,
		...(query.cursor ? { cursor: query.cursor } : {}),
		...(family !== undefined ? { familyId: idValue(family, 'familyId') } : {}),
		...(status !== undefined ? { status: enumValue(status, 'status', ARCHITECTURE_STATUSES) } : {}),
	}
}
