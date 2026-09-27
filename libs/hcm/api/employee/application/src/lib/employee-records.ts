import {
	parseCollectionCreate,
	parseCollectionUpdate,
	parseCreateWorker,
	parseDuplicateCheck,
	parseEmergencyReveal,
	parseMerge,
	parsePersonCorrection,
	parseRecordOptionKind,
	parseRecordPageQuery,
	parseRecordQuery,
	type DuplicateCandidateDto,
	type EmergencyInfoDto,
	type PersonFactsInput,
	type ProfileFieldRef,
	type RecordOptionPage,
	type WorkerEventPage,
	type WorkerRecordDto,
	type WorkerRecordPage,
} from '@empflowyee/hcm-employee-contract'
import { HcmDomainError, idValue, invalidField } from '@empflowyee/hcm-runtime-contract'
import {
	commandHash,
	runIdempotent,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import type { RecordRow, WorkerLock } from '@empflowyee/hcm-api-workforce-foundation-application'
import type { EmployeeUnitOfWork, EmployeeWork } from './employee-unit'

const READ = 'records.read'
const MANAGE = 'records.manage'
const EMERGENCY = 'records.emergency.read'

/** Person fields and the standard profile field that governs each (HR allowlist). */
const PERSON_FIELDS: readonly [keyof WorkerRecordDto, ProfileFieldRef][] = [
	['givenName', 'standard:legal-given-name'],
	['middleName', 'standard:legal-middle-name'],
	['familyName', 'standard:legal-family-name'],
	['preferredName', 'standard:preferred-name'],
	['formerName', 'standard:former-name'],
	['birthDate', 'standard:birth-date'],
	['genderCode', 'standard:gender'],
	['gender', 'standard:gender'],
	['maritalStatusCode', 'standard:marital-status'],
	['maritalStatus', 'standard:marital-status'],
	['nationalityCode', 'standard:nationality'],
	['nationality', 'standard:nationality'],
]

/** WorkforceActivation requiredness of creation facts, by the standard field that governs each. */
const REQUIRED_FACTS: readonly [ProfileFieldRef, string, (input: CreateFacts) => unknown][] = [
	['standard:birth-date', 'person.birthDate', /** Value. */ (input) => input.person.birthDate],
	['standard:gender', 'person.genderCode', /** Value. */ (input) => input.person.genderCode],
	[
		'standard:marital-status',
		'person.maritalStatusCode',
		/** Value. */ (input) => input.person.maritalStatusCode,
	],
	[
		'standard:nationality',
		'person.nationalityCountryCode',
		/** Value. */ (input) => input.person.nationalityCountryCode,
	],
	[
		'standard:work-email',
		'employment.workEmail',
		/** Value. */ (input) => input.employment.workEmail,
	],
	[
		'standard:designation',
		'assignment.designationId',
		/** Value. */ (input) => input.assignment.designationId,
	],
	[
		'standard:department',
		'assignment.departmentId',
		/** Value. */ (input) => input.assignment.departmentId,
	],
]

type CreateFacts = ReturnType<typeof parseCreateWorker>

/** Refuse a stale expected revision. */
function requireRevision(current: number, expected: number): void {
	if (current !== expected) throw new HcmDomainError('revision-conflict')
}

/** Names of person facts that differ. */
function changedFacts(before: RecordRow, after: PersonFactsInput): string[] {
	const pairs: [string, unknown, unknown][] = [
		['givenName', before.givenName, after.givenName],
		['middleName', before.middleName, after.middleName],
		['familyName', before.familyName, after.familyName],
		['preferredName', before.preferredName, after.preferredName],
		['formerName', before.formerName, after.formerName],
		['birthDate', before.birthDate, after.birthDate],
		['genderCode', before.genderCode, after.genderCode],
		['maritalStatusCode', before.maritalStatusCode, after.maritalStatusCode],
		['nationalityCountryCode', before.nationalityCode, after.nationalityCountryCode],
	]
	return pairs
		.filter(/** Changed. */ ([, old, next]) => old !== next)
		.map(/** Name. */ ([name]) => name)
}

/**
 * Employee Records use cases: tenant-wide worker records for HR, person corrections with a reason,
 * purpose-bound emergency reveal, worker creation with duplicate resolution, and explicit merge.
 */
export class EmployeeRecords {
	/** Bind the use cases to the employee unit of work. */
	constructor(private readonly unit: EmployeeUnitOfWork) {}

	/** Workers of the tenant, including pending and ended ones. */
	list(context: AuthenticatedHcmContext, params: URLSearchParams): Promise<WorkerRecordPage> {
		const query = parseRecordQuery(params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Page the records. */ (w) => {
				const { q, sort, limit, cursor, ...filters } = query
				return w.records.records(
					{ q, sort: sort === 'workerNumber:asc' ? 'workerNumber' : 'name', ...filters },
					{ limit, ...(cursor ? { cursor } : {}) },
					w.today,
				)
			},
		)
	}

	/** One worker's record, filtered by the HR allowlist. */
	detail(context: AuthenticatedHcmContext, workerId: string): Promise<WorkerRecordDto> {
		idValue(workerId, 'workerId')
		return this.unit.execute(
			context,
			READ,
			false,
			/** Read and filter the record. */ (w) => this.read(w, workerId),
		)
	}

	/** A worker's events, newest first. */
	events(
		context: AuthenticatedHcmContext,
		workerId: string,
		params: URLSearchParams,
	): Promise<WorkerEventPage> {
		idValue(workerId, 'workerId')
		const page = parseRecordPageQuery(params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Page the events of a known worker. */ async (w) => {
				const record = await w.records.record(workerId, w.today)
				if (!record) throw new HcmDomainError('not-found')
				return w.records.events(record.workerId, {
					limit: page.limit,
					...(page.cursor ? { cursor: page.cursor } : {}),
				})
			},
		)
	}

	/** Options for corrections and creation. */
	options(
		context: AuthenticatedHcmContext,
		kind: string,
		params: URLSearchParams,
	): Promise<RecordOptionPage> {
		const optionKind = parseRecordOptionKind(kind)
		const query = parseRecordPageQuery(params)
		const page = { limit: query.limit, ...(query.cursor ? { cursor: query.cursor } : {}) }
		return this.unit.execute(
			context,
			MANAGE,
			false,
			/** Page one option kind. */ async (w) => {
				if (optionKind === 'worker-types') {
					const types = await w.records.workerTypes()
					return {
						items: types.map(/** Option. */ (item) => ({ id: item.id, code: '', name: item.name })),
						nextCursor: null,
					}
				}
				if (
					optionKind === 'genders' ||
					optionKind === 'marital-statuses' ||
					optionKind === 'countries' ||
					optionKind === 'relationship-types'
				) {
					const rows = await w.profile.references(optionKind)
					const q = query.q.toLowerCase()
					return {
						items: rows
							.filter(/** Matching. */ (row) => !q || row.name.toLowerCase().includes(q))
							.map(/** Option. */ (row) => ({ id: row.code, code: row.code, name: row.name })),
						nextCursor: null,
					}
				}
				if (optionKind === 'managers') {
					const result = await w.records.records(
						{ q: query.q, sort: 'name', status: 'Active' },
						page,
						w.today,
					)
					return {
						items: result.items.map(
							/** Option. */ (row) => ({
								id: row.workerId,
								code: row.workerNumber,
								name: row.displayName,
							}),
						),
						nextCursor: result.nextCursor,
					}
				}
				const result = await w.structure.options(
					optionKind,
					{ q: query.q, sort: 'name:asc', activeOnly: true, ...page },
					w.today,
				)
				return {
					items: result.items.map(
						/** Option. */ (item) => ({ id: item.id, code: item.code, name: item.name }),
					),
					nextCursor: result.nextCursor,
				}
			},
		)
	}

	/** Correct legal names and personal facts with a reason. */
	correctPerson(
		context: AuthenticatedHcmContext,
		workerId: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<WorkerRecordDto> {
		idValue(workerId, 'workerId')
		const command = parsePersonCorrection(body)
		return this.command(
			context,
			'person.correct',
			{ workerId, command },
			key,
			/** Correct the facts. */ async (w) => {
				const lock = await this.lockCurrent(w, workerId)
				requireRevision(lock.personRevision, command.expectedRevision)
				const before = await w.records.record(workerId, w.today)
				if (!before) throw new HcmDomainError('not-found')
				const { expectedRevision, reason, ...facts } = command
				await this.requirePersonReferences(w, facts, '')
				await w.facts.correctPersonFacts(lock.personId, expectedRevision, facts)
				await this.audit(w, 'employee.record-person-corrected', lock.personId, requestId, {
					reason,
					changedFields: changedFacts(before, facts),
				})
				return this.read(w, workerId)
			},
		)
	}

	/** Add an address, contact point or relationship with a reason. */
	addItem(
		context: AuthenticatedHcmContext,
		workerId: string,
		collection: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<WorkerRecordDto> {
		idValue(workerId, 'workerId')
		const command = parseCollectionCreate(collection, body)
		return this.command(
			context,
			`${command.collection}.add`,
			{ workerId, command },
			key,
			/** Add the item. */ async (w) => {
				const lock = await this.lockCurrent(w, workerId)
				if (command.collection === 'addresses')
					await w.records.addAddress(lock.personId, command.address)
				else if (command.collection === 'contact-points')
					await w.profile.addContactPoint(
						lock.personId,
						command.contact.type,
						command.contact.value,
					)
				else await w.profile.addRelationship(lock.personId, command.relationship)
				await this.audit(w, 'employee.record-item-added', lock.personId, requestId, {
					reason: command.reason,
					changedFields: [this.field(command.collection)],
				})
				return this.read(w, workerId)
			},
		)
	}

	/** Correct, end or deactivate an address, contact point or relationship with a reason. */
	updateItem(
		context: AuthenticatedHcmContext,
		workerId: string,
		collection: string,
		itemId: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<WorkerRecordDto> {
		idValue(workerId, 'workerId')
		idValue(itemId, 'itemId')
		const command = parseCollectionUpdate(collection, body)
		return this.command(
			context,
			`${command.collection}.update`,
			{ workerId, itemId, command },
			key,
			/** Change the item. */ async (w) => {
				const lock = await this.lockCurrent(w, workerId)
				const person = lock.personId
				if ('deactivate' in command) {
					if (command.collection === 'contact-points')
						await w.profile.deactivateContactPoint(person, itemId, command.expectedRevision)
					else await w.profile.deactivateRelationship(person, itemId, command.expectedRevision)
				} else if (command.collection === 'addresses') {
					if ('effectiveTo' in command)
						await w.records.endAddress(
							person,
							itemId,
							command.expectedRevision,
							command.effectiveTo,
						)
					else
						await w.records.replaceAddress(
							person,
							itemId,
							command.expectedRevision,
							command.address,
						)
				} else if (command.collection === 'contact-points') {
					const { expectedRevision, ...change } = command.contact
					await w.profile.updateContactPoint(person, itemId, expectedRevision, change)
				} else
					await w.profile.updateRelationship(
						person,
						itemId,
						command.expectedRevision,
						command.relationship,
					)
				await this.audit(w, 'employee.record-item-changed', person, requestId, {
					reason: command.reason,
					changedFields: [this.field(command.collection)],
				})
				return this.read(w, workerId)
			},
		)
	}

	/** Reveal blood group and emergency contacts for a stated purpose; audited as sensitive access. */
	revealEmergency(
		context: AuthenticatedHcmContext,
		workerId: string,
		body: unknown,
		requestId: string,
	): Promise<EmergencyInfoDto> {
		idValue(workerId, 'workerId')
		const command = parseEmergencyReveal(body)
		return this.unit.execute(
			context,
			EMERGENCY,
			true,
			/** Read and audit in one transaction; no value reaches the evidence. */ async (w) => {
				const record = await w.records.record(workerId, w.today)
				if (!record) throw new HcmDomainError('not-found')
				await w.audit.append({
					action: 'employee.emergency-revealed',
					category: 'sensitive-access',
					targetType: 'worker',
					targetId: record.workerId,
					requestId,
					summary: {
						reason: command.purpose,
						changedFields: ['bloodGroup', 'emergencyContacts'],
						fromState: null,
						toState: null,
					},
				})
				return {
					bloodGroup: await w.records.bloodGroup(record.personId),
					emergencyContacts: record.relationships.filter(
						/** Emergency contacts only. */ (item) => item.emergencyContact,
					),
				}
			},
		)
	}

	/** Existing people matching the candidate facts (DEC-HCM2-001). */
	duplicateCheck(
		context: AuthenticatedHcmContext,
		body: unknown,
	): Promise<{ candidates: DuplicateCandidateDto[] }> {
		const command = parseDuplicateCheck(body)
		return this.unit.execute(
			context,
			MANAGE,
			false,
			/** Compare normalized names with birth dates, and work emails. */ async (w) => ({
				candidates: await w.reads.duplicateCandidates(command),
			}),
		)
	}

	/**
	 * Create person, worker, employment, primary assignment and manager line in one transaction.
	 * Any duplicate candidate blocks creation until the request resolves every candidate.
	 */
	create(
		context: AuthenticatedHcmContext,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<WorkerRecordDto> {
		const command = parseCreateWorker(body)
		return this.command(
			context,
			'worker.create',
			command,
			key,
			/** Create every fact together. */ async (w) => {
				const candidates = await w.reads.duplicateCandidates({
					givenName: command.person.givenName,
					familyName: command.person.familyName,
					birthDate: command.person.birthDate,
					workEmail: command.employment.workEmail,
				})
				const resolution = command.duplicateResolution
				if (candidates.length) {
					const resolved = resolution.kind === 'create-new' ? resolution.candidatePersonIds : []
					if (candidates.some(/** Unresolved. */ (item) => !resolved.includes(item.personId)))
						throw new HcmDomainError('duplicate-candidate')
				}
				await this.requireActivationFacts(w, command)
				await this.requirePersonReferences(w, command.person, 'person.')
				const hire = command.employment.hireDate
				const { worker } = await w.facts.createPersonWithWorker({
					facts: command.person,
					workerCode: command.worker.workerNumber,
					workerTypeId: command.worker.workerTypeId,
				})
				const employment = await w.facts.createEmployment({
					workerId: worker.id,
					legalEntityId: command.employment.legalEntityId,
					employmentType: command.employment.employmentType,
					employmentStatus: hire > w.today ? 'Pending' : 'Active',
					hireDate: hire,
					isPrimary: true,
					workEmail: command.employment.workEmail,
					continuousServiceStartDate: hire,
					probationEndDate: command.employment.probationEndDate,
					probationStatus: command.employment.probationEndDate ? 'InProgress' : 'NotApplicable',
					noticePeriodDays: command.employment.noticePeriodDays,
				})
				const a = command.assignment
				const assignment = await w.facts.openAssignment(employment.id, {
					organisationId: a.unitId,
					locationId: a.locationId,
					departmentId: a.departmentId,
					designationId: a.designationId,
					jobTitle: a.jobTitle,
					workMode: a.workMode,
					fullTimeEquivalent: a.fullTimeEquivalent,
					standardHoursPerWeek: a.standardHoursPerWeek,
					isPrimary: true,
					isBillable: false,
					costCenterCode: a.costCenterCode,
					effectiveFrom: hire,
					changeNote: 'Hired',
				})
				if (command.managerWorkerId) {
					const managed = await w.reads.currentAssignments(command.managerWorkerId, hire)
					const manager = managed.find(/** Primary. */ (item) => item.isPrimary) ?? managed[0]
					if (!manager) invalidField('managerWorkerId', 'no-assignment')
					await w.facts.setReportingLine({
						assignmentId: assignment.id,
						managerAssignmentId: manager.id,
						type: 'Solid',
						isPrimary: true,
						effectiveFrom: hire,
						reason: command.reason,
					})
				}
				await w.facts.recordWorkerEvent({
					workerId: worker.id,
					employmentId: employment.id,
					assignmentId: assignment.id,
					eventTypeCode: 'HIRED',
					effectiveDate: hire,
					reason: command.reason,
					previousValueSummary: '',
					newValueSummary: '',
					approvedByAccountId: null,
					approvedOn: null,
				})
				if (resolution.kind === 'create-new')
					await this.audit(w, 'employee.duplicate-resolved', worker.id, requestId, {
						reason: resolution.reason,
						changedFields: ['duplicateResolution'],
					})
				await w.audit.append({
					action: 'employee.worker-created',
					category: 'business',
					targetType: 'worker',
					targetId: worker.id,
					requestId,
					summary: {
						reason: command.reason,
						changedFields: ['person', 'worker', 'employment', 'assignment'],
						fromState: null,
						toState: hire > w.today ? 'Pending' : 'Active',
					},
				})
				return this.read(w, worker.id)
			},
		)
	}

	/**
	 * Merge a duplicate into a survivor. HCM-2 allows it only when the duplicate has no established
	 * employment; its history stays reachable from the survivor.
	 */
	merge(
		context: AuthenticatedHcmContext,
		workerId: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<WorkerRecordDto> {
		idValue(workerId, 'workerId')
		const command = parseMerge(body)
		return this.command(
			context,
			'person.merge',
			{ workerId, command },
			key,
			/** Merge explicitly. */ async (w) => {
				if (command.survivorWorkerId === workerId) invalidField('survivorWorkerId', 'same')
				const duplicate = await this.lockCurrent(w, workerId)
				const survivor = await this.lockCurrent(w, command.survivorWorkerId, 'survivorWorkerId')
				requireRevision(duplicate.personRevision, command.expectedRevision)
				requireRevision(survivor.personRevision, command.survivorExpectedRevision)
				if (duplicate.established) throw new HcmDomainError('merge-requires-correction')
				await w.facts.mergePerson(duplicate.personId, survivor.personId, command.expectedRevision)
				await w.audit.append({
					action: 'employee.person-merged',
					category: 'business',
					targetType: 'person',
					targetId: duplicate.personId,
					requestId,
					summary: {
						reason: command.reason,
						changedFields: ['mergedIntoPersonId'],
						fromState: 'Active',
						toState: 'Merged',
					},
				})
				return this.read(w, survivor.workerId)
			},
		)
	}

	/** Refuse unknown gender, marital status and nationality codes with field errors. */
	private async requirePersonReferences(
		w: EmployeeWork,
		facts: PersonFactsInput,
		prefix: string,
	): Promise<void> {
		const checks: [string | null, 'genders' | 'marital-statuses' | 'countries', string][] = [
			[facts.genderCode, 'genders', 'genderCode'],
			[facts.maritalStatusCode, 'marital-statuses', 'maritalStatusCode'],
			[facts.nationalityCountryCode, 'countries', 'nationalityCountryCode'],
		]
		for (const [code, kind, field] of checks) {
			if (code === null) continue
			const known = await w.profile.references(kind)
			if (!known.some(/** Same code. */ (row) => row.code === code))
				invalidField(`${prefix}${field}`, 'unknown')
		}
	}

	/** Require the policy's WorkforceActivation facts on creation. */
	private async requireActivationFacts(w: EmployeeWork, command: CreateFacts): Promise<void> {
		const catalogue = await w.policy.catalogue()
		for (const [ref, field, value] of REQUIRED_FACTS) {
			const policy = catalogue.find(/** Same field. */ (item) => item.ref === ref)
			const requiredness = (policy?.tenantPolicy ?? policy?.productDefault)?.requiredness
			const present = value(command)
			if (requiredness === 'Required' && (present === null || present === ''))
				invalidField(field, 'required')
		}
	}

	/** Lock a worker that has not been merged away. */
	private async lockCurrent(
		w: EmployeeWork,
		workerId: string,
		field?: string,
	): Promise<WorkerLock> {
		const lock = await w.records.lockWorker(workerId)
		if (!lock) {
			if (field) invalidField(field, 'unknown')
			throw new HcmDomainError('not-found')
		}
		if (lock.mergedIntoWorkerId) throw new HcmDomainError('invalid-state')
		return lock
	}

	/** Audit field name of a collection. */
	private field(collection: string): string {
		return {
			addresses: 'addresses',
			'contact-points': 'contactPoints',
			relationships: 'relationships',
		}[collection] as string
	}

	/** One record filtered by the HR allowlist; emergency values are never included. */
	private async read(w: EmployeeWork, workerId: string): Promise<WorkerRecordDto> {
		const record = await w.records.record(workerId, w.today)
		if (!record) throw new HcmDomainError('not-found')
		const visible =
			(await w.visibility.visibleFields('Hr', [record.workerId])).get(record.workerId) ??
			new Set<ProfileFieldRef>()
		/** Whether the HR allowlist includes a standard field. */
		const sees = (ref: ProfileFieldRef) => visible.has(ref)
		const dto: WorkerRecordDto = {
			workerId: record.workerId,
			personId: record.personId,
			personRevision: record.personRevision,
			workerNumber: record.workerNumber,
			workerType: record.workerType,
			displayName: record.displayName,
			recordState: record.recordState,
			employments: record.employments.map(
				/** Work email follows its field policy. */ ({ workEmail, ...employment }) =>
					sees('standard:work-email') ? { ...employment, workEmail } : employment,
			),
			assignments: record.assignments,
			reporting: record.reporting,
			directReportCount: record.directReportCount,
			mergedFromWorkerId: record.workerId === workerId ? null : workerId,
		}
		const target = dto as unknown as Record<string, unknown>
		const source = record as unknown as Record<string, unknown>
		for (const [field, ref] of PERSON_FIELDS) if (sees(ref)) target[field] = source[field]
		if (sees('standard:personal-email') || sees('standard:mobile-phone'))
			dto.contactPoints = record.contactPoints
				.filter(
					/** Visible types only. */ (item) =>
						(item.type === 'PersonalEmail' && sees('standard:personal-email')) ||
						(item.type === 'MobilePhone' && sees('standard:mobile-phone')),
				)
				.map(
					/** Typed. */ (item) => ({ ...item, type: item.type as 'PersonalEmail' | 'MobilePhone' }),
				)
		if (sees('standard:home-address'))
			dto.addresses = record.addresses.map(/** Typed. */ (item) => ({ ...item, type: item.type }))
		if (sees('standard:family-members') || sees('standard:emergency-contacts'))
			dto.relationships = record.relationships
				.filter(
					/** Each kind follows its own field policy. */ (item) =>
						item.emergencyContact
							? sees('standard:emergency-contacts')
							: sees('standard:family-members'),
				)
				.map(
					/** An emergency contact's number is revealed only for a purpose. */ (item) => ({
						...item,
						contactNumber: item.emergencyContact ? null : item.contactNumber,
					}),
				)
		return dto
	}

	/** Append business evidence with a reason and field names, never values. */
	private audit(
		w: EmployeeWork,
		action: string,
		targetId: string,
		requestId: string,
		summary: { reason: string; changedFields: string[] },
	) {
		return w.audit.append({
			action,
			category: 'business',
			targetType: action.includes('worker') || action.includes('duplicate') ? 'worker' : 'person',
			targetId,
			requestId,
			summary: { ...summary, fromState: null, toState: null },
		})
	}

	/** Serialize a write and replay identical retries from the actor's receipt. */
	private command<T>(
		context: AuthenticatedHcmContext,
		operation: string,
		payload: unknown,
		key: string,
		work: (w: EmployeeWork) => Promise<T>,
	): Promise<T> {
		const hash = commandHash(operation, payload)
		return this.unit.execute(
			context,
			MANAGE,
			true,
			/** Keep receipts in the business transaction. */ (w) =>
				runIdempotent(
					w.receipts,
					`records.${operation}`,
					key,
					hash,
					/** Run once. */ () => work(w),
				),
		)
	}
}
