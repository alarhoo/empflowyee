import type { Revisioned } from './workforce-ports'

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-'
export const BLOOD_GROUPS: readonly BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
export type SelfContactType = 'PersonalEmail' | 'MobilePhone'

export interface ContactPointRow {
	id: string
	type: string
	value: string
	primary: boolean
	verified: boolean
	revision: number
}

export interface AddressRow {
	id: string
	type: string
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
}

export interface RelationshipRow {
	id: string
	relationshipType: string
	relationshipName: string
	fullName: string
	birthDate: string | null
	genderCode: string | null
	contactNumber: string
	dependent: boolean
	emergencyContact: boolean
	emergencyPriority: number | null
	revision: number
}

export interface ProfileAssignmentRow {
	assignmentId: string
	primary: boolean
	designation: string | null
	organisationUnit: string | null
	department: string | null
	location: string | null
	managerWorkerId: string | null
	managerDisplayName: string | null
	workMode: string | null
	fullTimeEquivalent: number | null
	standardHoursPerWeek: number | null
	costCentre: string | null
}

export interface ProfileEmploymentRow {
	employmentId: string
	primary: boolean
	legalEntity: string | null
	employmentType: string | null
	employmentStatus: string | null
	hireDate: string | null
	continuousServiceStartDate: string | null
	probationStatus: string | null
	probationEndDate: string | null
	noticePeriodDays: number | null
	eligibleForRehire: boolean | null
	workEmail: string | null
	assignments: ProfileAssignmentRow[]
}

/** The facts of one worker's own profile, before any field policy is applied. */
export interface SelfProfileRow {
	personId: string
	workerId: string
	personRevision: number
	displayName: string
	givenName: string
	middleName: string
	familyName: string
	preferredName: string
	formerName: string
	birthDate: string | null
	gender: string | null
	maritalStatus: string | null
	nationality: string | null
	bloodGroup: BloodGroup | null
	workerCode: string
	workerType: string | null
	contactPoints: ContactPointRow[]
	addresses: AddressRow[]
	relationships: RelationshipRow[]
	/** Current employments with an assignment effective on the date, primary first. */
	employments: ProfileEmploymentRow[]
}

export interface ReferenceRow {
	code: string
	name: string
	dependentEligible?: boolean
}

export interface RelationshipInput {
	relationshipType: string
	fullName: string
	birthDate: string | null
	genderCode: string | null
	contactNumber: string
	dependent: boolean
	emergencyContact: boolean
	emergencyPriority: number | null
}

/** A worker's own profile facts and the self-service changes the owning commands allow. */
export interface WorkforceProfilePort {
	/** The worker's own facts on a date, or undefined when the worker is unknown. */
	selfProfile(workerId: string, asOf: string): Promise<SelfProfileRow | undefined>
	/** Active product reference rows: relationship types or genders. */
	references(kind: 'relationship-types' | 'genders'): Promise<ReferenceRow[]>
	/** Change the preferred name and blood group; the display name and search text follow. */
	updateSelfFacts(
		personId: string,
		expectedRevision: number,
		facts: { preferredName: string; bloodGroup: BloodGroup | null },
	): Promise<Revisioned>
	/** Add an unverified personal contact point; the first active one of a type is primary. */
	addContactPoint(personId: string, type: SelfContactType, value: string): Promise<Revisioned>
	/** Change a contact point's value or make it primary. */
	updateContactPoint(
		personId: string,
		id: string,
		expectedRevision: number,
		change: { value: string; primary: boolean },
	): Promise<Revisioned>
	/** Deactivate a contact point; history is kept. */
	deactivateContactPoint(personId: string, id: string, expectedRevision: number): Promise<Revisioned>
	/** Add an emergency contact or family member. */
	addRelationship(personId: string, input: RelationshipInput): Promise<Revisioned>
	/** Change an emergency contact or family member. */
	updateRelationship(
		personId: string,
		id: string,
		expectedRevision: number,
		input: RelationshipInput,
	): Promise<Revisioned>
	/** Deactivate an emergency contact or family member; history is kept. */
	deactivateRelationship(personId: string, id: string, expectedRevision: number): Promise<Revisioned>
}
