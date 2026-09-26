import { randomUUID } from 'node:crypto'
import {
	PROFILE_VISIBILITIES,
	SELECT_DATA_TYPES,
	contactValue,
	customValue,
	parseContactPointCreate,
	parseContactPointUpdate,
	parseCustomValue,
	parseDeactivation,
	parseMyProfileOptions,
	parseRelationship,
	parseSelfPersonal,
	parseVisibilityPreference,
	type CustomFieldDefinitionDto,
	type CustomValue,
	type MyAssignmentDto,
	type MyEmploymentDto,
	type MyProfileDto,
	type MyProfileFieldDto,
	type MyReferencePage,
	type ProfileFieldDto,
	type ProfileFieldRef,
	type ProfileVisibility,
	type RelationshipCommand,
	type SelfContactPointType,
	type SelfEditMode,
} from '@empflowyee/hcm-employee-contract'
import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'
import {
	commandHash,
	runIdempotent,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import { effectiveVisibility, visibilityRank } from '@empflowyee/hcm-api-employee-domain'
import type {
	ProfileEmploymentRow,
	SelfProfileRow,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import type { EmployeeUnitOfWork, EmployeeWork } from './employee-unit'

/** Who owns a custom value: exactly one of the four owner kinds. */
export interface CustomValueOwner {
	column: 'person_id' | 'worker_id' | 'employment_id' | 'assignment_id'
	id: string
}

/** A custom value in force on a date. */
export interface CustomValueRow {
	id: string
	fieldId: string
	ownerId: string
	value: CustomValue
	effectiveFrom: string
	revision: number
}

/** A worker's current visibility preference with its row identity. */
export interface SelfPreferenceRow {
	id: string
	ref: ProfileFieldRef
	visibility: ProfileVisibility
	revision: number
}

/** Employee-owned self-service persistence bound to one authorized transaction. */
export interface SelfServiceRepository {
	/** Active custom field definitions with their options. */
	customFields(): Promise<CustomFieldDefinitionDto[]>
	/** Custom values in force on a date for the given owners. */
	customValues(owners: readonly CustomValueOwner[], asOf: string): Promise<CustomValueRow[]>
	/** Lock the value of a field and owner in force on a date. */
	lockCustomValue(
		fieldId: string,
		owner: CustomValueOwner,
		asOf: string,
	): Promise<CustomValueRow | undefined>
	/** Record a value from a date; select options are linked to it. */
	insertCustomValue(input: {
		id: string
		field: CustomFieldDefinitionDto
		owner: CustomValueOwner
		value: CustomValue
		effectiveFrom: string
	}): Promise<void>
	/** Replace a value recorded today in place. */
	replaceCustomValue(id: string, field: CustomFieldDefinitionDto, value: CustomValue): Promise<void>
	/** End a value the day before a successor starts, linking the successor when one exists. */
	closeCustomValue(id: string, effectiveTo: string, successorId: string | null): Promise<void>
	/** The worker's current preferences. */
	selfPreferences(workerId: string): Promise<SelfPreferenceRow[]>
	/** Close a current preference, linking the successor when one replaces it. */
	closePreference(id: string, successorId: string | null): Promise<void>
	/** Insert the new current preference. */
	insertPreference(input: {
		id: string
		workerId: string
		ref: ProfileFieldRef
		visibility: ProfileVisibility
		revision: number
	}): Promise<void>
}

const READ = 'profile.self.read'
const MANAGE = 'profile.self.manage'

/** Scalar person and worker facts shown as display values. */
const SCALAR_FIELDS: Record<string, (row: SelfProfileRow) => string | null> = {
	'display-name': /** Display name. */ (row) => row.displayName,
	'legal-given-name': /** Given name. */ (row) => row.givenName || null,
	'legal-middle-name': /** Middle name. */ (row) => row.middleName || null,
	'legal-family-name': /** Family name. */ (row) => row.familyName || null,
	'preferred-name': /** Preferred name. */ (row) => row.preferredName || null,
	'former-name': /** Former name. */ (row) => row.formerName || null,
	'worker-number': /** Worker code. */ (row) => row.workerCode,
	'birth-date': /** Birth date. */ (row) => row.birthDate,
	gender: /** Gender. */ (row) => row.gender,
	'marital-status': /** Marital status. */ (row) => row.maritalStatus,
	nationality: /** Nationality. */ (row) => row.nationality,
	'blood-group': /** Blood group. */ (row) => row.bloodGroup,
	'worker-type': /** Worker type. */ (row) => row.workerType,
}

const CONTACT_FIELDS: Record<SelfContactPointType, string> = {
	PersonalEmail: 'personal-email',
	MobilePhone: 'mobile-phone',
}

/** The profile policy as the worker sees it on one request. */
interface SelfView {
	workerId: string
	row: SelfProfileRow
	fields: Map<ProfileFieldRef, MyProfileFieldDto>
	customFields: Map<string, CustomFieldDefinitionDto>
}

/** Whether a standard field is visible to the worker. */
function sees(view: SelfView, code: string): boolean {
	return view.fields.has(`standard:${code}`)
}

/** Refuse a change to a field the worker may not edit directly. */
function requireDirect(view: SelfView, ref: ProfileFieldRef, field: string): MyProfileFieldDto {
	const entry = view.fields.get(ref)
	if (!entry || entry.editMode !== 'Direct')
		throw new HcmDomainError('field-not-editable', [{ field, code: 'field-not-editable' }])
	return entry
}

/** Sensitive and Restricted values need field encryption, which is not available yet. */
function storable(field: CustomFieldDefinitionDto): boolean {
	return field.sensitivity === 'DirectorySafe' || field.sensitivity === 'Personal'
}

/** The day before an ISO date. */
function dayBefore(date: string): string {
	const value = new Date(`${date}T00:00:00Z`)
	value.setUTCDate(value.getUTCDate() - 1)
	return value.toISOString().slice(0, 10)
}

/** My Profile use cases: the worker's own record through the Self allowlist. */
export class MyProfile {
	/** Bind the use cases to the employee unit of work. */
	constructor(private readonly unit: EmployeeUnitOfWork) {}

	/** The worker's own profile, or an explanatory unlinked profile. */
	read(context: AuthenticatedHcmContext): Promise<MyProfileDto> {
		return this.unit.execute(
			context,
			READ,
			false,
			/** Assemble the own profile. */ async (w) => {
				const view = await this.view(w)
				return view ? this.project(w, view) : this.unlinked()
			},
		)
	}

	/** Reference options for relationship and gender pickers. */
	options(
		context: AuthenticatedHcmContext,
		kind: string,
		params: URLSearchParams,
	): Promise<MyReferencePage> {
		const query = parseMyProfileOptions(kind, params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Filter the active reference rows. */ async (w) => {
				const needle = query.q.toLowerCase()
				const rows = await w.profile.references(query.kind)
				return {
					items: rows.filter(
						/** Name match. */ (row) => !needle || row.name.toLowerCase().includes(needle),
					),
					nextCursor: null,
				}
			},
		)
	}

	/** Change the preferred name or blood group. */
	updatePersonal(
		context: AuthenticatedHcmContext,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<MyProfileDto> {
		const command = parseSelfPersonal(body)
		return this.command(
			context,
			'personal.update',
			command,
			key,
			/** Update person facts through the workforce port. */ async (w, view) => {
				const changed: string[] = []
				if (command.preferredName !== undefined) {
					requireDirect(view, 'standard:preferred-name', 'preferredName')
					if (command.preferredName !== view.row.preferredName) changed.push('preferredName')
				}
				if (command.bloodGroup !== undefined) {
					requireDirect(view, 'standard:blood-group', 'bloodGroup')
					if (command.bloodGroup !== view.row.bloodGroup) changed.push('bloodGroup')
				}
				await w.profile.updateSelfFacts(view.row.personId, command.expectedRevision, {
					preferredName: command.preferredName ?? view.row.preferredName,
					bloodGroup: command.bloodGroup === undefined ? view.row.bloodGroup : command.bloodGroup,
				})
				await this.audit(w, view, requestId, changed)
			},
		)
	}

	/** Add an unverified personal email or mobile number. */
	addContactPoint(
		context: AuthenticatedHcmContext,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<MyProfileDto> {
		const command = parseContactPointCreate(body)
		return this.command(
			context,
			'contact-point.add',
			command,
			key,
			/** Add through the workforce port. */ async (w, view) => {
				requireDirect(view, `standard:${CONTACT_FIELDS[command.type]}`, 'type')
				await w.profile.addContactPoint(view.row.personId, command.type, command.value)
				await this.audit(w, view, requestId, [this.contactField(command.type)])
			},
		)
	}

	/** Change a contact value or make it primary; a changed value stays unverified. */
	updateContactPoint(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<MyProfileDto> {
		idValue(id, 'id')
		const command = parseContactPointUpdate(body)
		return this.command(
			context,
			'contact-point.update',
			{ id, command },
			key,
			/** Update through the workforce port. */ async (w, view) => {
				const type = this.contactType(view, id)
				requireDirect(view, `standard:${CONTACT_FIELDS[type]}`, 'value')
				await w.profile.updateContactPoint(view.row.personId, id, command.expectedRevision, {
					value: contactValue(type, command.value),
					primary: command.primary,
				})
				await this.audit(w, view, requestId, [this.contactField(type)])
			},
		)
	}

	/** Remove a contact point from the profile; history is kept. */
	deactivateContactPoint(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<MyProfileDto> {
		idValue(id, 'id')
		const command = parseDeactivation(body)
		return this.command(
			context,
			'contact-point.deactivate',
			{ id, command },
			key,
			/** Deactivate through the workforce port. */ async (w, view) => {
				const type = this.contactType(view, id)
				requireDirect(view, `standard:${CONTACT_FIELDS[type]}`, 'id')
				await w.profile.deactivateContactPoint(view.row.personId, id, command.expectedRevision)
				await this.audit(w, view, requestId, [this.contactField(type)])
			},
		)
	}

	/** Add an emergency contact or family member. */
	addRelationship(
		context: AuthenticatedHcmContext,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<MyProfileDto> {
		const command = parseRelationship(body, false)
		return this.command(
			context,
			'relationship.add',
			command,
			key,
			/** Add through the workforce port. */ async (w, view) => {
				const changed = this.requireRelationshipEdit(view, command, null)
				await w.profile.addRelationship(view.row.personId, command)
				await this.audit(w, view, requestId, changed)
			},
		)
	}

	/** Change an emergency contact or family member. */
	updateRelationship(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<MyProfileDto> {
		idValue(id, 'id')
		const command = parseRelationship(body, true)
		return this.command(
			context,
			'relationship.update',
			{ id, command },
			key,
			/** Update through the workforce port. */ async (w, view) => {
				const changed = this.requireRelationshipEdit(view, command, id)
				await w.profile.updateRelationship(
					view.row.personId,
					id,
					command.expectedRevision ?? 0,
					command,
				)
				await this.audit(w, view, requestId, changed)
			},
		)
	}

	/** Remove an emergency contact or family member; history is kept. */
	deactivateRelationship(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<MyProfileDto> {
		idValue(id, 'id')
		const command = parseDeactivation(body)
		return this.command(
			context,
			'relationship.deactivate',
			{ id, command },
			key,
			/** Deactivate through the workforce port. */ async (w, view) => {
				const changed = this.requireRelationshipEdit(view, null, id)
				await w.profile.deactivateRelationship(view.row.personId, id, command.expectedRevision)
				await this.audit(w, view, requestId, changed)
			},
		)
	}

	/** Set or clear a Direct custom value; today's value is replaced, earlier values are superseded. */
	setCustomValue(
		context: AuthenticatedHcmContext,
		fieldId: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<MyProfileDto> {
		idValue(fieldId, 'fieldId')
		const command = parseCustomValue(body)
		return this.command(
			context,
			'custom-value.set',
			{ fieldId, command },
			key,
			/** Record the value as the employee owner of custom values. */ async (w, view) => {
				const field = view.customFields.get(fieldId)
				if (!field) throw new HcmDomainError('not-found')
				requireDirect(view, `custom:${fieldId}`, 'value')
				if (!storable(field))
					throw new HcmDomainError('field-not-editable', [
						{ field: 'value', code: 'encryption-unavailable' },
					])
				const optionIds = field.options
					.filter(/** Active options. */ (option) => option.active)
					.map(/** Id. */ (option) => option.id)
				const value = customValue(field.dataType, command.value, optionIds)
				const owner = this.owner(view, field)
				if (!owner) throw new HcmDomainError('invalid-state')
				const current = await w.selfService.lockCustomValue(fieldId, owner, w.today)
				if ((current?.revision ?? null) !== command.expectedRevision)
					throw new HcmDomainError('revision-conflict')
				if (current && current.effectiveFrom === w.today)
					await w.selfService.replaceCustomValue(current.id, field, value)
				else {
					if (current) await w.selfService.closeCustomValue(current.id, dayBefore(w.today), null)
					const id = `${owner.id}/custom-value/${randomUUID()}`
					await w.selfService.insertCustomValue({
						id,
						field,
						owner,
						value,
						effectiveFrom: w.today,
					})
					if (current) await w.selfService.closeCustomValue(current.id, dayBefore(w.today), id)
				}
				await this.audit(w, view, requestId, ['customField'])
			},
		)
	}

	/** Narrow a field's visibility for this worker, or return it to the policy with null. */
	setVisibility(
		context: AuthenticatedHcmContext,
		fieldRef: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<MyProfileDto> {
		const command = parseVisibilityPreference(fieldRef, body)
		return this.command(
			context,
			'visibility.set',
			command,
			key,
			/** Replace the current preference row. */ async (w, view) => {
				const preference = view.fields.get(command.ref)?.preference
				if (!preference)
					throw new HcmDomainError('field-not-editable', [
						{ field: 'visibility', code: 'preference-not-allowed' },
					])
				if (command.visibility && !preference.options.includes(command.visibility))
					throw new HcmDomainError('visibility-ceiling-exceeded', [
						{ field: 'visibility', code: 'visibility-ceiling-exceeded' },
					])
				const current = (await w.selfService.selfPreferences(view.workerId)).find(
					/** This field. */ (row) => row.ref === command.ref,
				)
				if ((current?.revision ?? null) !== command.expectedRevision)
					throw new HcmDomainError('revision-conflict')
				if (current) await w.selfService.closePreference(current.id, null)
				if (command.visibility) {
					const id = `${view.workerId}/visibility/${randomUUID()}`
					await w.selfService.insertPreference({
						id,
						workerId: view.workerId,
						ref: command.ref,
						visibility: command.visibility,
						revision: (current?.revision ?? 0) + 1,
					})
					if (current) await w.selfService.closePreference(current.id, id)
				}
				await w.audit.append({
					action: 'employee.visibility-preference-changed',
					category: 'business',
					targetType: command.ref.startsWith('custom:') ? 'custom-field' : 'profile-field',
					targetId: command.ref,
					requestId,
					summary: { reason: null, changedFields: ['visibility'], fromState: null, toState: null },
				})
			},
		)
	}

	/** Resolve the worker and evaluate the Self allowlist once per transaction. */
	private async view(w: EmployeeWork): Promise<SelfView | undefined> {
		const workerId = await w.reads.accountWorker(w.accountId)
		if (!workerId) return undefined
		const row = await w.profile.selfProfile(workerId, w.today)
		if (!row) return undefined
		const [catalogue, preferences, customFields] = await Promise.all([
			w.policy.catalogue(),
			w.selfService.selfPreferences(workerId),
			w.selfService.customFields(),
		])
		const definitions = new Map(customFields.map(/** By id. */ (field) => [field.id, field]))
		const own = new Map(preferences.map(/** By ref. */ (pref) => [pref.ref, pref]))
		const fields = new Map<ProfileFieldRef, MyProfileFieldDto>()
		for (const field of catalogue) {
			if (!field.active) continue
			const current = own.get(field.ref)
			const visibility = this.visibility(field, current?.visibility ?? null)
			if (!visibility) continue
			fields.set(field.ref, {
				ref: field.ref,
				code: field.code,
				name: field.name,
				section: field.section,
				value: field.custom ? null : (SCALAR_FIELDS[field.code]?.(row) ?? null),
				editMode: this.editMode(field),
				visibility,
				preference: this.preference(field, current),
				custom: null,
			})
		}
		return { workerId, row, fields, customFields: definitions }
	}

	/** Effective visibility of a field with an optional preference. */
	private visibility(
		field: ProfileFieldDto,
		preference: ProfileVisibility | null,
	): ProfileVisibility | null {
		return effectiveVisibility({
			ceiling: field.ceiling,
			productDefault: field.productDefault,
			tenantPolicy: field.tenantPolicy,
			preference,
		})
	}

	/** The self edit mode in force; custom fields without a tenant policy are not editable. */
	private editMode(field: ProfileFieldDto): SelfEditMode {
		return (field.tenantPolicy ?? field.productDefault)?.selfEditMode ?? 'NotEditable'
	}

	/** The worker's choice and the audiences still open to it, where the policy allows one. */
	private preference(
		field: ProfileFieldDto,
		current: { visibility: ProfileVisibility; revision: number } | undefined,
	) {
		if (!(field.tenantPolicy ?? field.productDefault)?.allowWorkerPreference) return null
		const policy = this.visibility(field, null)
		if (!policy) return null
		return {
			visibility: current?.visibility ?? null,
			options: PROFILE_VISIBILITIES.filter(
				/** Never wider than the policy. */ (option) =>
					visibilityRank(option) <= visibilityRank(policy),
			),
			revision: current?.revision ?? null,
		}
	}

	/** The owner of a custom value: the person, worker, or the primary employment and assignment. */
	private owner(view: SelfView, field: CustomFieldDefinitionDto): CustomValueOwner | undefined {
		const employment = view.row.employments[0]
		switch (field.ownerScope) {
			case 'Person':
				return { column: 'person_id', id: view.row.personId }
			case 'Worker':
				return { column: 'worker_id', id: view.workerId }
			case 'Employment':
				return employment && { column: 'employment_id', id: employment.employmentId }
			default: {
				const assignment = employment?.assignments[0]
				return assignment && { column: 'assignment_id', id: assignment.assignmentId }
			}
		}
	}

	/** The self-service type of an active contact point of the worker. */
	private contactType(view: SelfView, id: string): SelfContactPointType {
		const contact = view.row.contactPoints.find(/** This contact. */ (row) => row.id === id)
		if (!contact || !(contact.type in CONTACT_FIELDS)) throw new HcmDomainError('not-found')
		return contact.type as SelfContactPointType
	}

	/** Audit field name of a contact type. */
	private contactField(type: SelfContactPointType): string {
		return type === 'PersonalEmail' ? 'personalEmail' : 'mobilePhone'
	}

	/** Emergency contacts and family members are separate fields; a change must be Direct in both it touches. */
	private requireRelationshipEdit(
		view: SelfView,
		command: RelationshipCommand | null,
		id: string | null,
	): string[] {
		const existing = id
			? view.row.relationships.find(/** This relationship. */ (row) => row.id === id)
			: undefined
		if (id && !existing) throw new HcmDomainError('not-found')
		const changed = new Set<string>()
		if (command?.emergencyContact || existing?.emergencyContact) changed.add('emergencyContacts')
		if ((command && !command.emergencyContact) || (existing && !existing.emergencyContact))
			changed.add('familyMembers')
		if (command?.dependent || existing?.dependent) changed.add('familyMembers')
		for (const name of changed)
			requireDirect(
				view,
				name === 'emergencyContacts' ? 'standard:emergency-contacts' : 'standard:family-members',
				name === 'emergencyContacts' ? 'emergencyContact' : 'dependent',
			)
		return [...changed]
	}

	/** Record which fields changed, never their values. */
	private audit(w: EmployeeWork, view: SelfView, requestId: string, changed: string[]) {
		return w.audit.append({
			action: 'employee.my-profile-changed',
			category: 'business',
			targetType: 'person',
			targetId: view.row.personId,
			requestId,
			summary: { reason: null, changedFields: changed, fromState: null, toState: null },
		})
	}

	/** Serialize a self-service write, replay identical retries and return the refreshed profile. */
	private command(
		context: AuthenticatedHcmContext,
		operation: string,
		payload: unknown,
		key: string,
		work: (w: EmployeeWork, view: SelfView) => Promise<void>,
	): Promise<MyProfileDto> {
		const hash = commandHash(operation, payload)
		return this.unit.execute(
			context,
			MANAGE,
			true,
			/** Keep receipts in the business transaction. */ (w) =>
				runIdempotent(
					w.receipts,
					`my-profile.${operation}`,
					key,
					hash,
					/** Run once. */ async () => {
						const view = await this.view(w)
						if (!view) throw new HcmDomainError('not-found')
						await work(w, view)
						const refreshed = await this.view(w)
						if (!refreshed) throw new HcmDomainError('not-found')
						return this.project(w, refreshed)
					},
				),
		)
	}

	/** The explanatory profile of an account without a linked worker. */
	private unlinked(): MyProfileDto {
		return {
			linked: false,
			displayName: null,
			workerNumber: null,
			personRevision: null,
			fields: [],
			employments: [],
			correctionsAvailable: false,
		}
	}

	/** Serialize the Self allowlist; collections appear only while their field is visible. */
	private async project(w: EmployeeWork, view: SelfView): Promise<MyProfileDto> {
		const { row } = view
		await this.attachCustomValues(w, view)
		const dto: MyProfileDto = {
			linked: true,
			displayName: row.displayName,
			workerNumber: sees(view, 'worker-number') ? row.workerCode : null,
			personRevision: row.personRevision,
			fields: [...view.fields.values()],
			employments: row.employments.map(
				/** One employment. */ (employment) => this.employment(view, employment),
			),
			correctionsAvailable: false,
		}
		const contactTypes = (Object.keys(CONTACT_FIELDS) as SelfContactPointType[]).filter(
			/** Visible contact types. */ (type) => sees(view, CONTACT_FIELDS[type]),
		)
		if (contactTypes.length)
			dto.contactPoints = row.contactPoints
				.filter(
					/** Visible self types. */ (c) => contactTypes.includes(c.type as SelfContactPointType),
				)
				.map(/** Contact. */ (c) => ({ ...c, type: c.type as SelfContactPointType }))
		if (sees(view, 'home-address'))
			dto.addresses = row.addresses.map(
				/** Address without internal codes. */ ({
					countryCode: _code,
					effectiveFrom: _from,
					effectiveTo: _to,
					...address
				}) => address,
			)
		const emergency = sees(view, 'emergency-contacts')
		const family = sees(view, 'family-members')
		if (emergency || family)
			dto.relationships = row.relationships.filter(
				/** Visible category. */ (r) => (r.emergencyContact ? emergency : family),
			)
		return dto
	}

	/** Attach definitions and values in force to the visible custom fields. */
	private async attachCustomValues(w: EmployeeWork, view: SelfView): Promise<void> {
		const owners: CustomValueOwner[] = []
		for (const field of view.customFields.values()) {
			const owner = this.owner(view, field)
			if (owner) owners.push(owner)
		}
		const values = owners.length ? await w.selfService.customValues(owners, w.today) : []
		for (const field of view.customFields.values()) {
			const entry = view.fields.get(`custom:${field.id}`)
			if (!entry) continue
			const owner = this.owner(view, field)
			const current = values.find(
				/** This field and owner. */ (value) =>
					value.fieldId === field.id && value.ownerId === owner?.id,
			)
			const plain = storable(field)
			entry.custom = {
				dataType: field.dataType,
				ownerScope: field.ownerScope,
				options: this.choices(field, current?.value),
				value: plain ? (current?.value ?? null) : null,
				revision: current?.revision ?? null,
				storable: plain && Boolean(owner),
			}
			if (!plain || !owner)
				entry.editMode = entry.editMode === 'Direct' ? 'NotEditable' : entry.editMode
		}
	}

	/** Active options of a select field, plus any retired option still chosen. */
	private choices(field: CustomFieldDefinitionDto, value: CustomValue | undefined) {
		if (!SELECT_DATA_TYPES.includes(field.dataType)) return []
		return field.options
			.filter(/** Active or chosen. */ (option) => option.active || this.chosen(value, option.id))
			.map(/** Option. */ (option) => ({ id: option.id, name: option.name }))
	}

	/** Whether a select value includes an option. */
	private chosen(value: CustomValue | undefined, optionId: string): boolean {
		return Array.isArray(value) ? value.includes(optionId) : value === optionId
	}

	/** One employment with only the visible employment and assignment facts. */
	private employment(view: SelfView, e: ProfileEmploymentRow): MyEmploymentDto {
		const dto: MyEmploymentDto = {
			employmentId: e.employmentId,
			primary: e.primary,
			assignments: e.assignments.map(
				/** One assignment. */ (a) => {
					const assignment: MyAssignmentDto = { assignmentId: a.assignmentId, primary: a.primary }
					if (sees(view, 'designation')) assignment.designation = a.designation
					if (sees(view, 'organisation-unit')) assignment.organisationUnit = a.organisationUnit
					if (sees(view, 'department')) assignment.department = a.department
					if (sees(view, 'location')) assignment.location = a.location
					if (sees(view, 'manager'))
						assignment.manager =
							a.managerWorkerId && a.managerDisplayName
								? { workerId: a.managerWorkerId, displayName: a.managerDisplayName }
								: null
					if (sees(view, 'work-mode')) assignment.workMode = a.workMode
					if (sees(view, 'full-time-equivalent'))
						assignment.fullTimeEquivalent = a.fullTimeEquivalent
					if (sees(view, 'standard-hours')) assignment.standardHoursPerWeek = a.standardHoursPerWeek
					if (sees(view, 'cost-centre')) assignment.costCentre = a.costCentre
					return assignment
				},
			),
		}
		if (sees(view, 'legal-entity')) dto.legalEntity = e.legalEntity
		if (sees(view, 'worker-type')) dto.workerType = view.row.workerType
		if (sees(view, 'employment-type')) dto.employmentType = e.employmentType
		if (sees(view, 'employment-status')) dto.employmentStatus = e.employmentStatus
		if (sees(view, 'hire-date')) dto.hireDate = e.hireDate
		if (sees(view, 'continuous-service-start-date'))
			dto.continuousServiceStartDate = e.continuousServiceStartDate
		if (sees(view, 'probation')) {
			dto.probationStatus = e.probationStatus
			dto.probationEndDate = e.probationEndDate
		}
		if (sees(view, 'notice-period')) dto.noticePeriodDays = e.noticePeriodDays
		if (sees(view, 'rehire-eligibility')) dto.eligibleForRehire = e.eligibleForRehire
		if (sees(view, 'work-email')) dto.workEmail = e.workEmail
		return dto
	}
}
