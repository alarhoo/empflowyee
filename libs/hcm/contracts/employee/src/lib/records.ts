import {
	boolValue,
	codeValue,
	dateValue,
	decimalValue,
	enumValue,
	idValue,
	invalidField,
	optionalDate,
	optionalId,
	optionalInt,
	optionalText,
	readBody,
	readListQuery,
	revisionValue,
	textValue,
	type HcmPage,
} from '@empflowyee/hcm-runtime-contract'
import {
	SELF_CONTACT_TYPES,
	contactValue,
	parseContactPointUpdate,
	parseRelationship,
	type ContactPointCreateCommand,
	type ContactPointUpdateCommand,
	type MyContactPointDto,
	type MyRelationshipDto,
	type RelationshipCommand,
} from './my-profile'

/**
 * Employee Records vocabulary (Employee Records TDD#API): tenant-wide worker records for HR,
 * person corrections with a reason, purpose-bound emergency reveal, creation and explicit merge.
 * Employment and assignment facts are read-only here; Employment Changes owns them.
 */
export const RECORD_STATES = ['Complete', 'Incomplete'] as const
export type RecordStateValue = (typeof RECORD_STATES)[number]

export const EMPLOYMENT_STATUSES = ['Pending', 'Active', 'OnNotice', 'Suspended', 'Ended'] as const
export type EmploymentStatusValue = (typeof EMPLOYMENT_STATUSES)[number]

export const EMPLOYMENT_TYPES = [
	'Permanent',
	'FixedTerm',
	'Contract',
	'Internship',
	'Apprenticeship',
	'Consultant',
] as const
export type EmploymentTypeValue = (typeof EMPLOYMENT_TYPES)[number]

export const WORK_MODES = ['OnSite', 'Remote', 'Hybrid'] as const
export type WorkModeValue = (typeof WORK_MODES)[number]

export const ADDRESS_TYPES = ['Permanent', 'Current', 'Correspondence', 'Emergency'] as const
export type AddressTypeValue = (typeof ADDRESS_TYPES)[number]

export const RECORD_COLLECTIONS = ['addresses', 'contact-points', 'relationships'] as const
export type RecordCollection = (typeof RECORD_COLLECTIONS)[number]

export const RECORD_OPTION_KINDS = [
	'legal-entities',
	'units',
	'departments',
	'designations',
	'locations',
	'worker-types',
	'managers',
	'genders',
	'marital-statuses',
	'countries',
	'relationship-types',
] as const
export type RecordOptionKind = (typeof RECORD_OPTION_KINDS)[number]

export interface NamedDto {
	id: string
	name: string
}

export interface WorkerRecordSummaryDto {
	workerId: string
	personId: string
	displayName: string
	workerNumber: string
	designation: string | null
	unit: string | null
	employmentStatus: string | null
	recordState: RecordStateValue
}

export type WorkerRecordPage = HcmPage<WorkerRecordSummaryDto>

export interface RecordAddressDto {
	id: string
	type: AddressTypeValue
	line1: string
	line2: string
	locality: string
	city: string
	stateOrProvince: string
	postalCode: string
	countryCode: string
	countryName: string
	primary: boolean
	effectiveFrom: string
	effectiveTo: string | null
	revision: number
}

export interface RecordEmploymentDto {
	employmentId: string
	primary: boolean
	legalEntity: NamedDto | null
	employmentType: string | null
	employmentStatus: string | null
	hireDate: string | null
	endDate: string | null
	workEmail?: string | null
	probationStatus: string | null
	probationEndDate: string | null
	noticePeriodDays: number | null
	eligibleForRehire: boolean | null
}

export interface RecordAssignmentDto {
	assignmentId: string
	employmentId: string
	primary: boolean
	jobTitle: string
	designation: string | null
	unit: string | null
	department: string | null
	location: string | null
	position: { id: string; code: string; name: string } | null
	workMode: string | null
	fullTimeEquivalent: number | null
	standardHoursPerWeek: number | null
	costCentre: string | null
	effectiveFrom: string | null
	effectiveTo: string | null
}

export interface RecordReportingDto {
	reportingLineId: string
	assignmentId: string
	managerWorkerId: string
	managerName: string
	type: string
	primary: boolean
	effectiveFrom: string
	effectiveTo: string | null
}

/** A family member or emergency contact; an emergency contact's number stays hidden until revealed. */
export type RecordRelationshipDto = Omit<MyRelationshipDto, 'contactNumber'> & {
	contactNumber: string | null
}

/**
 * A worker's record for HR. Person fields outside the HR allowlist are omitted, never null;
 * blood group and emergency contact numbers appear only through an emergency reveal.
 */
export interface WorkerRecordDto {
	workerId: string
	personId: string
	personRevision: number
	workerNumber: string
	workerType: NamedDto | null
	displayName: string
	recordState: RecordStateValue
	givenName?: string
	middleName?: string
	familyName?: string
	preferredName?: string
	formerName?: string
	birthDate?: string | null
	genderCode?: string | null
	gender?: string | null
	maritalStatusCode?: string | null
	maritalStatus?: string | null
	nationalityCode?: string | null
	nationality?: string | null
	contactPoints?: MyContactPointDto[]
	addresses?: RecordAddressDto[]
	relationships?: RecordRelationshipDto[]
	employments: RecordEmploymentDto[]
	assignments: RecordAssignmentDto[]
	reporting: RecordReportingDto[]
	directReportCount: number
	/** Set when the requested worker was merged into this survivor. */
	mergedFromWorkerId: string | null
}

export interface WorkerEventDto {
	id: string
	eventType: string
	eventTypeCode: string
	effectiveDate: string
	recordedAt: string
	reason: string
	previousValueSummary: string
	newValueSummary: string
}

export type WorkerEventPage = HcmPage<WorkerEventDto>

export interface EmergencyInfoDto {
	bloodGroup: string | null
	emergencyContacts: MyRelationshipDto[]
}

export interface DuplicateCandidateDto {
	personId: string
	workerId: string | null
	displayName: string
	reason: 'name-and-birth-date' | 'work-email'
}

export interface RecordOptionDto {
	id: string
	code: string
	name: string
	/** For managers: the assignment a reporting line points to. */
	assignmentId?: string
}

export type RecordOptionPage = HcmPage<RecordOptionDto>

// Commands and queries.

export interface RecordQuery {
	q: string
	sort: 'name:asc' | 'workerNumber:asc'
	limit: number
	cursor?: string
	status?: EmploymentStatusValue
	legalEntityId?: string
	unitId?: string
	departmentId?: string
	locationId?: string
	workerTypeId?: string
	recordState?: RecordStateValue
}

export interface PersonFactsInput {
	givenName: string
	middleName: string
	familyName: string
	preferredName: string
	formerName: string
	birthDate: string | null
	genderCode: string | null
	maritalStatusCode: string | null
	nationalityCountryCode: string | null
}

export interface PersonCorrection extends PersonFactsInput {
	expectedRevision: number
	reason: string
}

export interface AddressInputDto {
	type: AddressTypeValue
	line1: string
	line2: string
	locality: string
	city: string
	stateOrProvince: string
	postalCode: string
	countryCode: string
	primary: boolean
	effectiveFrom: string
}

export type CollectionCreate =
	| { collection: 'addresses'; address: AddressInputDto; reason: string }
	| { collection: 'contact-points'; contact: ContactPointCreateCommand; reason: string }
	| { collection: 'relationships'; relationship: RelationshipCommand; reason: string }

/** A deactivation of a contact point or relationship; history is kept. */
export interface ItemDeactivation {
	collection: 'contact-points' | 'relationships'
	deactivate: true
	expectedRevision: number
	reason: string
}

/** A corrected relationship. */
export interface RelationshipUpdate {
	collection: 'relationships'
	relationship: RelationshipCommand
	expectedRevision: number
	reason: string
}

export type CollectionUpdate =
	| { collection: 'addresses'; address: AddressInputDto; expectedRevision: number; reason: string }
	| { collection: 'addresses'; effectiveTo: string; expectedRevision: number; reason: string }
	| { collection: 'contact-points'; contact: ContactPointUpdateCommand; reason: string }
	| ItemDeactivation
	| RelationshipUpdate

export interface DuplicateCheck {
	givenName: string
	familyName: string
	birthDate: string | null
	workEmail: string | null
}

export interface EmploymentInput {
	legalEntityId: string
	employmentType: EmploymentTypeValue
	hireDate: string
	workEmail: string | null
	probationEndDate: string | null
	noticePeriodDays: number | null
}

export interface AssignmentInput {
	unitId: string
	departmentId: string | null
	designationId: string | null
	locationId: string
	jobTitle: string
	workMode: WorkModeValue
	fullTimeEquivalent: number
	standardHoursPerWeek: number | null
	costCenterCode: string
}

export type DuplicateResolution =
	{ kind: 'none' } | { kind: 'create-new'; candidatePersonIds: string[]; reason: string }

export interface CreateWorkerCommand {
	person: PersonFactsInput
	worker: { workerNumber: string; workerTypeId: string }
	employment: EmploymentInput
	assignment: AssignmentInput
	/** The manager's worker; their primary assignment becomes the solid line. */
	managerWorkerId: string | null
	duplicateResolution: DuplicateResolution
	reason: string
}

export interface MergeCommand {
	survivorWorkerId: string
	expectedRevision: number
	survivorExpectedRevision: number
	reason: string
}

const WORKER_NUMBER = /^[A-Z0-9][A-Z0-9_-]{1,39}$/

/** Parse a correction reason. */
function reasonValue(value: unknown, field = 'reason'): string {
	return textValue(value, field, 500).trim()
}

/** Parse legal names and personal facts. */
function personFacts(v: Record<string, unknown>): PersonFactsInput {
	return {
		givenName: textValue(v['givenName'], 'givenName', 100).trim(),
		middleName: optionalText(v['middleName'], 'middleName', 100).trim(),
		familyName: textValue(v['familyName'], 'familyName', 100).trim(),
		preferredName: optionalText(v['preferredName'], 'preferredName', 100).trim(),
		formerName: optionalText(v['formerName'], 'formerName', 100).trim(),
		birthDate: optionalDate(v['birthDate'], 'birthDate'),
		genderCode: optionalId(v['genderCode'], 'genderCode'),
		maritalStatusCode: optionalId(v['maritalStatusCode'], 'maritalStatusCode'),
		nationalityCountryCode: optionalId(v['nationalityCountryCode'], 'nationalityCountryCode'),
	}
}

const PERSON_OPTIONAL = [
	'middleName',
	'preferredName',
	'formerName',
	'birthDate',
	'genderCode',
	'maritalStatusCode',
	'nationalityCountryCode',
] as const

/** Parse a correction of legal names and personal facts. */
export function parsePersonCorrection(body: unknown): PersonCorrection {
	const v = readBody(
		body,
		['givenName', 'familyName', 'expectedRevision', 'reason'],
		PERSON_OPTIONAL,
	)
	return {
		...personFacts(v),
		expectedRevision: revisionValue(v['expectedRevision']),
		reason: reasonValue(v['reason']),
	}
}

/** Parse an address. */
function address(value: unknown): AddressInputDto {
	const v = readBody(
		value,
		['type', 'city', 'countryCode', 'effectiveFrom'],
		['line1', 'line2', 'locality', 'stateOrProvince', 'postalCode', 'primary'],
	)
	return {
		type: enumValue(v['type'], 'type', ADDRESS_TYPES),
		line1: optionalText(v['line1'], 'line1', 200).trim(),
		line2: optionalText(v['line2'], 'line2', 200).trim(),
		locality: optionalText(v['locality'], 'locality', 100).trim(),
		city: textValue(v['city'], 'city', 100).trim(),
		stateOrProvince: optionalText(v['stateOrProvince'], 'stateOrProvince', 100).trim(),
		postalCode: optionalText(v['postalCode'], 'postalCode', 20).trim(),
		countryCode: codeValue(v['countryCode'], 'countryCode', /^[A-Z]{2}$/),
		primary: v['primary'] === undefined ? false : boolValue(v['primary'], 'primary'),
		effectiveFrom: dateValue(v['effectiveFrom'], 'effectiveFrom'),
	}
}

/** Split the reason off a collection body so the item parsers see only item fields. */
function withReason(body: unknown): { rest: Record<string, unknown>; reason: string } {
	if (!body || typeof body !== 'object' || Array.isArray(body)) readBody(body, ['reason'])
	const { reason, ...rest } = body as Record<string, unknown>
	if (reason === undefined) invalidField('reason', 'required')
	return { rest, reason: reasonValue(reason) }
}

/** Parse the collection path segment. */
export function parseRecordCollection(value: string): RecordCollection {
	return enumValue(value, 'collection', RECORD_COLLECTIONS)
}

/** Parse a new address, contact point or relationship. */
export function parseCollectionCreate(collection: string, body: unknown): CollectionCreate {
	const kind = parseRecordCollection(collection)
	const { rest, reason } = withReason(body)
	if (kind === 'addresses') return { collection: kind, address: address(rest), reason }
	if (kind === 'contact-points') {
		const v = readBody(rest, ['type', 'value'])
		const type = enumValue(v['type'], 'type', SELF_CONTACT_TYPES)
		return { collection: kind, contact: { type, value: contactValue(type, v['value']) }, reason }
	}
	const relationship = parseRelationship(rest, false)
	const { expectedRevision: _ignored, ...fields } = relationship
	void _ignored
	return { collection: kind, relationship: fields, reason }
}

/** Parse a correction, end or deactivation of a collection item. */
export function parseCollectionUpdate(collection: string, body: unknown): CollectionUpdate {
	const kind = parseRecordCollection(collection)
	const { rest, reason } = withReason(body)
	if ('deactivate' in rest && kind !== 'addresses') {
		const v = readBody(rest, ['deactivate', 'expectedRevision'])
		if (v['deactivate'] !== true) invalidField('deactivate')
		return {
			collection: kind,
			deactivate: true,
			expectedRevision: revisionValue(v['expectedRevision']),
			reason,
		}
	}
	if (kind === 'addresses') {
		if ('effectiveTo' in rest) {
			const v = readBody(rest, ['effectiveTo', 'expectedRevision'])
			return {
				collection: kind,
				effectiveTo: dateValue(v['effectiveTo'], 'effectiveTo'),
				expectedRevision: revisionValue(v['expectedRevision']),
				reason,
			}
		}
		const { expectedRevision, ...fields } = rest
		return {
			collection: kind,
			address: address(fields),
			expectedRevision: revisionValue(expectedRevision),
			reason,
		}
	}
	if (kind === 'contact-points')
		return { collection: kind, contact: parseContactPointUpdate(rest), reason }
	const { expectedRevision, ...relationship } = parseRelationship(rest, true)
	return {
		collection: kind,
		relationship,
		expectedRevision: expectedRevision as number,
		reason,
	}
}

/** Parse an emergency reveal; the purpose is audited, never the values. */
export function parseEmergencyReveal(body: unknown): { purpose: string } {
	const v = readBody(body, ['purpose'])
	return { purpose: textValue(v['purpose'], 'purpose', 500).trim() }
}

/** Parse the facts compared for duplicates (DEC-HCM2-001). */
export function parseDuplicateCheck(body: unknown): DuplicateCheck {
	const v = readBody(body, ['givenName', 'familyName'], ['birthDate', 'workEmail'])
	const email = optionalText(v['workEmail'], 'workEmail', 254).trim()
	if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalidField('workEmail', 'format')
	return {
		givenName: textValue(v['givenName'], 'givenName', 100).trim(),
		familyName: textValue(v['familyName'], 'familyName', 100).trim(),
		birthDate: optionalDate(v['birthDate'], 'birthDate'),
		workEmail: email || null,
	}
}

/** Parse a new worker with employment, primary assignment and manager line. */
export function parseCreateWorker(body: unknown): CreateWorkerCommand {
	const v = readBody(
		body,
		['person', 'worker', 'employment', 'assignment', 'duplicateResolution', 'reason'],
		['managerWorkerId'],
	)
	const p = readBody(v['person'], ['givenName', 'familyName'], PERSON_OPTIONAL)
	const w = readBody(v['worker'], ['workerNumber', 'workerTypeId'])
	const e = readBody(
		v['employment'],
		['legalEntityId', 'employmentType', 'hireDate'],
		['workEmail', 'probationEndDate', 'noticePeriodDays'],
	)
	const a = readBody(
		v['assignment'],
		['unitId', 'locationId', 'jobTitle', 'workMode', 'fullTimeEquivalent'],
		['departmentId', 'designationId', 'standardHoursPerWeek', 'costCenterCode'],
	)
	const email = optionalText(e['workEmail'], 'employment.workEmail', 254).trim()
	if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
		invalidField('employment.workEmail', 'format')
	const hours = a['standardHoursPerWeek']
	const r = readBody(v['duplicateResolution'], ['kind'], ['candidatePersonIds', 'reason'])
	const kind = enumValue(r['kind'], 'duplicateResolution.kind', ['none', 'create-new'] as const)
	let resolution: DuplicateResolution = { kind: 'none' }
	if (kind === 'create-new') {
		const ids = r['candidatePersonIds']
		if (!Array.isArray(ids) || !ids.length || ids.length > 20)
			invalidField('duplicateResolution.candidatePersonIds')
		resolution = {
			kind,
			candidatePersonIds: (ids as unknown[]).map(
				/** One candidate. */ (id, index) =>
					idValue(id, `duplicateResolution.candidatePersonIds.${index}`),
			),
			reason: reasonValue(r['reason'], 'duplicateResolution.reason'),
		}
	}
	return {
		person: personFacts(p),
		worker: {
			workerNumber: codeValue(w['workerNumber'], 'worker.workerNumber', WORKER_NUMBER),
			workerTypeId: idValue(w['workerTypeId'], 'worker.workerTypeId'),
		},
		employment: {
			legalEntityId: idValue(e['legalEntityId'], 'employment.legalEntityId'),
			employmentType: enumValue(e['employmentType'], 'employment.employmentType', EMPLOYMENT_TYPES),
			hireDate: dateValue(e['hireDate'], 'employment.hireDate'),
			workEmail: email || null,
			probationEndDate: optionalDate(e['probationEndDate'], 'employment.probationEndDate'),
			noticePeriodDays: optionalInt(e['noticePeriodDays'], 'employment.noticePeriodDays', 0, 365),
		},
		assignment: {
			unitId: idValue(a['unitId'], 'assignment.unitId'),
			departmentId: optionalId(a['departmentId'], 'assignment.departmentId'),
			designationId: optionalId(a['designationId'], 'assignment.designationId'),
			locationId: idValue(a['locationId'], 'assignment.locationId'),
			jobTitle: textValue(a['jobTitle'], 'assignment.jobTitle', 150).trim(),
			workMode: enumValue(a['workMode'], 'assignment.workMode', WORK_MODES),
			fullTimeEquivalent: decimalValue(
				a['fullTimeEquivalent'],
				'assignment.fullTimeEquivalent',
				0.01,
				1,
				2,
			),
			standardHoursPerWeek:
				hours === undefined || hours === null
					? null
					: decimalValue(hours, 'assignment.standardHoursPerWeek', 0.25, 168, 2),
			costCenterCode: optionalText(a['costCenterCode'], 'assignment.costCenterCode', 40).trim(),
		},
		managerWorkerId: optionalId(v['managerWorkerId'], 'managerWorkerId'),
		duplicateResolution: resolution,
		reason: reasonValue(v['reason']),
	}
}

/** Parse an explicit merge into a survivor. */
export function parseMerge(body: unknown): MergeCommand {
	const v = readBody(body, [
		'survivorWorkerId',
		'expectedRevision',
		'survivorExpectedRevision',
		'reason',
	])
	return {
		survivorWorkerId: idValue(v['survivorWorkerId'], 'survivorWorkerId'),
		expectedRevision: revisionValue(v['expectedRevision']),
		survivorExpectedRevision: revisionValue(
			v['survivorExpectedRevision'],
			'survivorExpectedRevision',
		),
		reason: reasonValue(v['reason']),
	}
}

/** Parse a record page query. */
export function parseRecordQuery(params: URLSearchParams): RecordQuery {
	const query = readListQuery(
		params,
		['name:asc', 'workerNumber:asc'],
		[
			'status',
			'legalEntityId',
			'unitId',
			'departmentId',
			'locationId',
			'workerTypeId',
			'recordState',
		],
	)
	const f = query.filters
	/** An optional id filter. */
	const id = (name: string) => (f[name] !== undefined ? { [name]: idValue(f[name], name) } : {})
	return {
		q: query.q,
		sort: query.sort as RecordQuery['sort'],
		limit: query.limit,
		...(query.cursor ? { cursor: query.cursor } : {}),
		...(f['status'] !== undefined
			? { status: enumValue(f['status'], 'status', EMPLOYMENT_STATUSES) }
			: {}),
		...id('legalEntityId'),
		...id('unitId'),
		...id('departmentId'),
		...id('locationId'),
		...id('workerTypeId'),
		...(f['recordState'] !== undefined
			? { recordState: enumValue(f['recordState'], 'recordState', RECORD_STATES) }
			: {}),
	}
}

/** Parse the option kind path segment. */
export function parseRecordOptionKind(value: string): RecordOptionKind {
	return enumValue(value, 'kind', RECORD_OPTION_KINDS)
}

/** Parse an option or event page query. */
export function parseRecordPageQuery(params: URLSearchParams): {
	q: string
	limit: number
	cursor?: string
} {
	const query = readListQuery(params, ['default'])
	return { q: query.q, limit: query.limit, ...(query.cursor ? { cursor: query.cursor } : {}) }
}
