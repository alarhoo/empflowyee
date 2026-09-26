/**
 * Cross-domain workforce ports (TDD-HCM-2-COMMON#ports). Workforce Foundation is the sole writer of
 * people, workers, employments, assignments, reporting lines and worker events; other domains
 * change them only through `WorkforceFactsPort`, bound to their own transaction so their writes
 * commit together. The owning command holds the tenant lock and authorization.
 */

export type EmploymentType =
	'Permanent' | 'FixedTerm' | 'Contract' | 'Internship' | 'Apprenticeship' | 'Consultant'
export type EmploymentStatus = 'Pending' | 'Active' | 'OnNotice' | 'Suspended' | 'Ended'
export type ProbationStatus = 'NotApplicable' | 'InProgress' | 'Confirmed' | 'Extended' | 'Failed'
export type WorkMode = 'OnSite' | 'Remote' | 'Hybrid'
export type ReportingLineType = 'Solid' | 'Dotted' | 'Temporary' | 'Administrative'

/** An identity and the revision a command left it at. */
export interface Revisioned {
	id: string
	revision: number
}

export interface PersonFacts {
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

export interface CreatePersonWithWorker {
	facts: PersonFacts
	workerCode: string
	workerTypeId: string
}

export interface CreateEmployment {
	workerId: string
	legalEntityId: string
	employmentType: EmploymentType
	employmentStatus: EmploymentStatus
	hireDate: string
	isPrimary: boolean
	workEmail: string | null
	continuousServiceStartDate: string | null
	probationEndDate: string | null
	probationStatus: ProbationStatus
	noticePeriodDays: number | null
}

export interface AssignmentFacts {
	organisationId: string
	locationId: string
	departmentId: string | null
	designationId: string | null
	jobTitle: string
	workMode: WorkMode
	fullTimeEquivalent: number
	standardHoursPerWeek: number | null
	isPrimary: boolean
	isBillable: boolean
	costCenterCode: string
	effectiveFrom: string
	changeNote: string
}

export interface SetReportingLine {
	assignmentId: string
	managerAssignmentId: string
	type: ReportingLineType
	isPrimary: boolean
	effectiveFrom: string
	reason: string
}

/** Employment facts a command may change; omitted properties keep their current value. */
export interface EmploymentFactsChange {
	expectedRevision: number
	employmentStatus?: EmploymentStatus
	workEmail?: string | null
	probationEndDate?: string | null
	probationStatus?: ProbationStatus
	confirmedOn?: string | null
	noticePeriodDays?: number | null
	resignationSubmittedOn?: string | null
	lastWorkingDate?: string | null
	employmentEndDate?: string | null
	employmentEndReasonId?: string | null
	isEligibleForRehire?: boolean | null
	rehireEligibilityNote?: string
}

export interface WorkerEventInput {
	workerId: string
	employmentId: string | null
	assignmentId: string | null
	eventTypeCode: string
	effectiveDate: string
	reason: string
	previousValueSummary: string
	newValueSummary: string
	approvedByAccountId: string | null
	approvedOn: string | null
}

/** Typed workforce commands. Each validates references and dated rules, and returns new revisions. */
export interface WorkforceFactsPort {
	/** Create a person and their single worker record. */
	createPersonWithWorker(input: CreatePersonWithWorker): Promise<{
		person: Revisioned
		worker: Revisioned
	}>
	/** Correct a person's names and personal facts at the expected revision. */
	correctPersonFacts(
		personId: string,
		expectedRevision: number,
		facts: PersonFacts,
	): Promise<Revisioned>
	/** Mark a duplicate person merged into a survivor; only without an established employment. */
	mergePerson(
		duplicatePersonId: string,
		survivorPersonId: string,
		expectedRevision: number,
	): Promise<Revisioned>
	/** Create an established employment and update the worker's engagement facts. */
	createEmployment(input: CreateEmployment): Promise<Revisioned>
	/** Open the first dated assignment of an established employment. */
	openAssignment(employmentId: string, facts: AssignmentFacts): Promise<Revisioned>
	/** Close an open assignment the day before and open its successor, carrying reporting lines. */
	supersedeAssignment(
		assignmentId: string,
		expectedRevision: number,
		facts: AssignmentFacts,
	): Promise<{ closed: Revisioned; opened: Revisioned }>
	/** Start a reporting line; a primary line closes the current primary line the day before. */
	setReportingLine(input: SetReportingLine): Promise<Revisioned>
	/** Change employment facts such as probation, notice and exit, keeping worker engagement current. */
	applyEmploymentFacts(employmentId: string, change: EmploymentFactsChange): Promise<Revisioned>
	/** Append one worker lifecycle event. */
	recordWorkerEvent(input: WorkerEventInput): Promise<{ id: string }>
}

export interface AssignmentFact {
	id: string
	employmentId: string
	workerId: string
	organisationId: string
	locationId: string
	departmentId: string | null
	designationId: string | null
	jobTitle: string
	isPrimary: boolean
	fullTimeEquivalent: number
	effectiveFrom: string
	effectiveTo: string | null
	revision: number
}

/**
 * One primary solid reporting line. The worker fields describe the person the query asked about:
 * the report for `directReports`, the manager for `primaryManager`.
 */
export interface ReportingEdge {
	reportingLineId: string
	assignmentId: string
	managerAssignmentId: string
	workerId: string
	displayName: string
	workerCode: string
}

export interface DuplicateCandidate {
	personId: string
	workerId: string | null
	displayName: string
	reason: 'name-and-birth-date' | 'work-email'
}

/** As-of workforce projections for other domains; established rows only, never guessed facts. */
export interface WorkforceReadPort {
	/** Today's business date in the organisation time zone. */
	businessToday(): Promise<string>
	/** The worker of the person linked to an account, if that person is a worker. */
	accountWorker(accountId: string): Promise<string | null>
	/** Established assignments of a worker effective on a date. */
	currentAssignments(workerId: string, asOf: string): Promise<AssignmentFact[]>
	/** The primary solid line of an assignment on a date, if any. */
	primaryManager(assignmentId: string, asOf: string): Promise<ReportingEdge | null>
	/** Assignments whose primary solid line points to one of the given assignments on a date. */
	directReports(managerAssignmentIds: readonly string[], asOf: string): Promise<ReportingEdge[]>
	/** Active people matching a normalized legal name and birth date, or a work email (DEC-HCM2-001). */
	duplicateCandidates(input: {
		givenName: string
		familyName: string
		birthDate: string | null
		workEmail: string | null
	}): Promise<DuplicateCandidate[]>
}

/** Verified tenant and actor of the caller's transaction. */
export interface WorkforceActor {
	tenantId: string
	accountId: string
}

/** Organization-visible person fields the org chart may serialize (TDD-HCM-2-COMMON#ports). */
export type OrgChartField =
	| 'display-name'
	| 'preferred-name'
	| 'worker-number'
	| 'work-email'
	| 'organisation-unit'
	| 'department'
	| 'designation'
	| 'location'
	| 'manager'
	| 'work-mode'

/**
 * Field policy of the org chart. Declared here and implemented by the employee module, so
 * workforce-foundation never depends on employee libraries; the API root wires the binder.
 */
export interface OrgChartFieldPolicy {
	/** Fields each worker exposes to Organization viewers after tenant policy and preferences. */
	organizationFields(workerIds: readonly string[]): Promise<Map<string, ReadonlySet<OrgChartField>>>
	/** Fields Organization viewers may search on, before any worker preference. */
	searchable(): Promise<ReadonlySet<OrgChartField>>
}

/** Bind the org-chart field policy to the caller's open, authorized transaction. */
export abstract class OrgChartFieldPolicyBinder {
	/** Return a policy that reads inside the given transaction as the given actor. */
	abstract bind(transaction: unknown, actor: WorkforceActor): OrgChartFieldPolicy
}

/**
 * Bind the workforce ports to a caller's open, authorized transaction. The transaction handle is
 * opaque to application code; infrastructure supplies the implementation.
 */
export abstract class WorkforcePortBinder {
	/** Return ports that run inside the given transaction as the given actor. */
	abstract bind(
		transaction: unknown,
		actor: WorkforceActor,
	): { facts: WorkforceFactsPort; reads: WorkforceReadPort }
}
