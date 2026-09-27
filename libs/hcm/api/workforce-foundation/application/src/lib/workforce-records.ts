import type { HcmPage } from '@empflowyee/hcm-runtime-contract'
import type { ContactPointRow, RelationshipRow } from './workforce-profile'
import type { Revisioned } from './workforce-ports'

/**
 * Tenant-wide worker records for HR (Employee Records TDD#READ). Rows include pending and ended
 * workers; a merged duplicate is hidden from search and its record resolves to the survivor.
 */
export type RecordState = 'Complete' | 'Incomplete'
export type AddressType = 'Permanent' | 'Current' | 'Correspondence' | 'Emergency'

export interface RecordFilter {
	q: string
	sort: 'name' | 'workerNumber'
	status?: string
	legalEntityId?: string
	unitId?: string
	departmentId?: string
	locationId?: string
	workerTypeId?: string
	recordState?: RecordState
}

export interface RecordSummaryRow {
	workerId: string
	personId: string
	displayName: string
	workerNumber: string
	designation: string | null
	unit: string | null
	employmentStatus: string | null
	recordState: RecordState
}

export interface NamedRef {
	id: string
	name: string
}

export interface RecordAddressRow {
	id: string
	type: AddressType
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

export interface RecordEmploymentRow {
	employmentId: string
	primary: boolean
	legalEntity: NamedRef | null
	employmentType: string | null
	employmentStatus: string | null
	hireDate: string | null
	endDate: string | null
	workEmail: string | null
	probationStatus: string | null
	probationEndDate: string | null
	noticePeriodDays: number | null
	eligibleForRehire: boolean | null
}

export interface RecordAssignmentRow {
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

export interface RecordReportingRow {
	reportingLineId: string
	assignmentId: string
	managerWorkerId: string
	managerName: string
	type: string
	primary: boolean
	effectiveFrom: string
	effectiveTo: string | null
}

/** One worker's complete record before any field policy is applied. */
export interface RecordRow {
	workerId: string
	personId: string
	personRevision: number
	workerNumber: string
	workerType: NamedRef | null
	displayName: string
	givenName: string
	middleName: string
	familyName: string
	preferredName: string
	formerName: string
	birthDate: string | null
	genderCode: string | null
	gender: string | null
	maritalStatusCode: string | null
	maritalStatus: string | null
	nationalityCode: string | null
	nationality: string | null
	recordState: RecordState
	contactPoints: ContactPointRow[]
	addresses: RecordAddressRow[]
	relationships: RelationshipRow[]
	employments: RecordEmploymentRow[]
	assignments: RecordAssignmentRow[]
	reporting: RecordReportingRow[]
	directReportCount: number
}

export interface WorkerEventRow {
	id: string
	eventType: string
	eventTypeCode: string
	effectiveDate: string
	recordedAt: string
	reason: string
	previousValueSummary: string
	newValueSummary: string
}

export interface AddressInput {
	type: AddressType
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

/** A worker the records commands act on, locked in the caller's transaction. */
export interface WorkerLock {
	workerId: string
	personId: string
	personRevision: number
	/** The survivor's worker when this worker's person was merged into another. */
	mergedIntoWorkerId: string | null
	established: boolean
}

/** HR records reads and the person-level corrections that have no self-service equivalent. */
export interface WorkforceRecordsPort {
	/** Workers of the tenant by name or number then id; merged duplicates are hidden. */
	records(
		filter: RecordFilter,
		page: { limit: number; cursor?: string },
		asOf: string,
	): Promise<HcmPage<RecordSummaryRow>>
	/** One worker's record, following a merged duplicate to its survivor. */
	record(workerId: string, asOf: string): Promise<RecordRow | undefined>
	/** Worker events by effective date then recorded time, newest first. */
	events(
		workerId: string,
		page: { limit: number; cursor?: string },
	): Promise<HcmPage<WorkerEventRow>>
	/** Lock a worker and its person. */
	lockWorker(workerId: string): Promise<WorkerLock | undefined>
	/** The person's blood group, read only for an emergency reveal. */
	bloodGroup(personId: string): Promise<string | null>
	/** Worker types for creation. */
	workerTypes(): Promise<NamedRef[]>
	/** Add an address effective from its date. */
	addAddress(personId: string, input: AddressInput): Promise<Revisioned>
	/** Close an address the day before the correction takes effect and add its successor. */
	replaceAddress(
		personId: string,
		id: string,
		expectedRevision: number,
		input: AddressInput,
	): Promise<Revisioned>
	/** End an address on a date. */
	endAddress(
		personId: string,
		id: string,
		expectedRevision: number,
		effectiveTo: string,
	): Promise<Revisioned>
}
