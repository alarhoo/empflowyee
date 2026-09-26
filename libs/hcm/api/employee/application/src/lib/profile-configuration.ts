import { randomUUID } from 'node:crypto'
import {
	PREVIEW_RELATIONS,
	SELECT_DATA_TYPES,
	parseCustomFieldCreate,
	parseCustomFieldOptionCreate,
	parseCustomFieldOptionUpdate,
	parseCustomFieldUpdate,
	parseFieldRef,
	parseTenantPolicy,
	parseTenantPolicyReset,
	type CustomFieldCreate,
	type CustomFieldDefinitionDto,
	type CustomFieldOptionInput,
	type CustomFieldOptionUpdate,
	type CustomFieldUpdate,
	type ProfileFieldDetailDto,
	type ProfileFieldDto,
	type ProfileFieldList,
	type ProfileFieldPolicyDto,
	type ProfileFieldRef,
	type RequirednessContext,
} from '@empflowyee/hcm-employee-contract'
import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'
import {
	commandHash,
	runIdempotent,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import { relationSees, requireTenantNarrowing } from '@empflowyee/hcm-api-employee-domain'
import type { ProfilePolicyReader } from './profile-visibility-port'
import type { EmployeeUnitOfWork, EmployeeWork } from './employee-unit'

/** Employee-owned policy persistence bound to one authorized transaction. */
export interface ProfilePolicyRepository extends ProfilePolicyReader {
	/** Description of a standard or custom field. */
	description(ref: ProfileFieldRef): Promise<string>
	/** A custom field with its options, or undefined when absent or foreign. */
	customField(id: string): Promise<CustomFieldDefinitionDto | undefined>
	/** Whether any value was ever stored for a custom field. */
	hasValues(id: string): Promise<boolean>
	/** Lock the current tenant policy row of a field and context. */
	lockPolicy(
		ref: ProfileFieldRef,
		context: RequirednessContext,
	): Promise<{ id: string; revision: number } | undefined>
	/** Close a current policy row, linking its successor when one replaces it. */
	closePolicy(id: string, successorId: string | null): Promise<void>
	/** Insert the new current policy row. */
	insertPolicy(input: {
		id: string
		ref: ProfileFieldRef
		context: RequirednessContext
		policy: ProfileFieldPolicyDto
		revision: number
	}): Promise<void>
	/** Lock a custom field and return its revision. */
	lockCustomField(id: string): Promise<number | undefined>
	/** Insert a custom field definition. */
	createCustomField(id: string, command: CustomFieldCreate): Promise<void>
	/** Insert one option of a select field. */
	createOption(fieldId: string, optionId: string, option: CustomFieldOptionInput): Promise<void>
	/** Update the mutable columns of a custom field and advance its revision. */
	updateCustomField(id: string, update: CustomFieldUpdate): Promise<void>
	/** Update one option; false when it does not belong to the field. */
	updateOption(fieldId: string, optionId: string, update: CustomFieldOptionUpdate): Promise<boolean>
	/** Advance a custom field revision after an option change. */
	touchCustomField(id: string): Promise<void>
}

const READ = 'profile-configuration.read'
const MANAGE = 'profile-configuration.manage'

/** Employee Profile Configuration use cases: narrow the product policy and define custom fields. */
export class ProfileConfiguration {
	/** Bind the use cases to the employee unit of work. */
	constructor(private readonly unit: EmployeeUnitOfWork) {}

	/** The bounded standard and custom field catalogue. */
	list(context: AuthenticatedHcmContext, params: URLSearchParams): Promise<ProfileFieldList> {
		for (const key of params.keys())
			throw new HcmDomainError('invalid-request', [{ field: key, code: 'unknown' }])
		return this.unit.execute(
			context,
			READ,
			false,
			/** Read the merged catalogue. */ async (w) => ({ items: await w.policy.catalogue() }),
		)
	}

	/** One field with its tenant policy and effective preview. */
	detail(context: AuthenticatedHcmContext, fieldRef: string): Promise<ProfileFieldDetailDto> {
		const ref = parseFieldRef(fieldRef)
		return this.unit.execute(context, READ, false, /** Read one field. */ (w) => this.read(w, ref))
	}

	/** Narrow the tenant policy of a field in one context. */
	setPolicy(
		context: AuthenticatedHcmContext,
		fieldRef: string,
		policyContext: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<ProfileFieldDetailDto> {
		const command = parseTenantPolicy(fieldRef, policyContext, body)
		return this.command(
			context,
			'policy.set',
			`${command.ref}/${command.context}`,
			command,
			key,
			/** Replace the current tenant policy with a narrower one. */ async (w) => {
				const field = await this.field(w, command.ref)
				requireTenantNarrowing(field.ceiling, field.productDefault, command.policy)
				const current = await w.policy.lockPolicy(command.ref, command.context)
				if ((current?.revision ?? 0) !== command.expectedRevision)
					throw new HcmDomainError('revision-conflict')
				const before = field.tenantPolicy ?? field.productDefault
				const id = randomUUID()
				if (current) await w.policy.closePolicy(current.id, null)
				await w.policy.insertPolicy({
					id,
					ref: command.ref,
					context: command.context,
					policy: command.policy,
					revision: (current?.revision ?? 0) + 1,
				})
				if (current) await w.policy.closePolicy(current.id, id)
				const changed = (Object.keys(command.policy) as (keyof ProfileFieldPolicyDto)[]).filter(
					/** Name only changed attributes. */ (name) => before?.[name] !== command.policy[name],
				)
				await this.audit(
					w,
					'employee.profile-policy-changed',
					command.ref,
					requestId,
					command.reason,
					changed,
				)
				return this.read(w, command.ref)
			},
		)
	}

	/** Return a field to the product default by closing the tenant policy. */
	resetPolicy(
		context: AuthenticatedHcmContext,
		fieldRef: string,
		policyContext: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<ProfileFieldDetailDto> {
		const command = parseTenantPolicyReset(fieldRef, policyContext, body)
		return this.command(
			context,
			'policy.reset',
			`${command.ref}/${command.context}`,
			command,
			key,
			/** Close the current tenant row. */ async (w) => {
				await this.field(w, command.ref)
				const current = await w.policy.lockPolicy(command.ref, command.context)
				if (!current) throw new HcmDomainError('invalid-state')
				if (current.revision !== command.expectedRevision)
					throw new HcmDomainError('revision-conflict')
				await w.policy.closePolicy(current.id, null)
				await this.audit(
					w,
					'employee.profile-policy-reset',
					command.ref,
					requestId,
					command.reason,
					['tenantPolicy'],
				)
				return this.read(w, command.ref)
			},
		)
	}

	/** Define a custom field and, for select types, its first options. */
	createCustomField(
		context: AuthenticatedHcmContext,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<ProfileFieldDetailDto> {
		const command = parseCustomFieldCreate(body)
		return this.command(
			context,
			'custom-field.create',
			'',
			command,
			key,
			/** Insert the definition and options. */ async (w) => {
				const id = randomUUID()
				await w.policy.createCustomField(id, command)
				for (const option of command.options) await w.policy.createOption(id, randomUUID(), option)
				const ref = `custom:${id}` as const
				await this.audit(w, 'employee.custom-field-created', ref, requestId, command.reason, [
					'code',
					'name',
					'ownerScope',
					'dataType',
					'sensitivity',
					'section',
					'searchable',
					...(command.options.length ? ['options'] : []),
				])
				return this.read(w, ref)
			},
		)
	}

	/** Edit a custom field's mutable attributes, or retire and reactivate it. */
	updateCustomField(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<ProfileFieldDetailDto> {
		const command = parseCustomFieldUpdate(body)
		idValue(id, 'id')
		return this.command(
			context,
			'custom-field.update',
			id,
			command,
			key,
			/** Check revision, update and audit. */ async (w) => {
				const before = await this.lockedField(w, id, command.expectedRevision)
				await w.policy.updateCustomField(id, command)
				const changed = (['name', 'description', 'section', 'sortOrder', 'active'] as const).filter(
					/** Name only changed attributes. */ (name) => before[name] !== command[name],
				)
				let action = 'employee.custom-field-updated'
				if (before.active !== command.active)
					action = command.active
						? 'employee.custom-field-activated'
						: 'employee.custom-field-retired'
				await this.audit(w, action, `custom:${id}`, requestId, command.reason, changed)
				return this.read(w, `custom:${id}`)
			},
		)
	}

	/** Add an option to a select field. */
	addOption(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<ProfileFieldDetailDto> {
		const command = parseCustomFieldOptionCreate(body)
		idValue(id, 'id')
		return this.command(
			context,
			'custom-field.option.create',
			id,
			command,
			key,
			/** Insert the option under the field lock. */ async (w) => {
				const field = await this.lockedField(w, id, command.expectedRevision)
				if (!SELECT_DATA_TYPES.includes(field.dataType)) throw new HcmDomainError('invalid-state')
				await w.policy.createOption(id, randomUUID(), command)
				await w.policy.touchCustomField(id)
				await this.audit(
					w,
					'employee.custom-field-option-added',
					`custom:${id}`,
					requestId,
					command.reason,
					['options'],
				)
				return this.read(w, `custom:${id}`)
			},
		)
	}

	/** Edit, retire or reactivate one option. */
	updateOption(
		context: AuthenticatedHcmContext,
		id: string,
		optionId: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<ProfileFieldDetailDto> {
		const command = parseCustomFieldOptionUpdate(body)
		idValue(id, 'id')
		idValue(optionId, 'optionId')
		return this.command(
			context,
			'custom-field.option.update',
			`${id}/${optionId}`,
			command,
			key,
			/** Update the option under the field lock. */ async (w) => {
				await this.lockedField(w, id, command.expectedRevision)
				if (!(await w.policy.updateOption(id, optionId, command)))
					throw new HcmDomainError('not-found')
				await w.policy.touchCustomField(id)
				await this.audit(
					w,
					'employee.custom-field-option-updated',
					`custom:${id}`,
					requestId,
					command.reason,
					['options'],
				)
				return this.read(w, `custom:${id}`)
			},
		)
	}

	/** A catalogue field, or not-found. */
	private async field(w: EmployeeWork, ref: ProfileFieldRef): Promise<ProfileFieldDto> {
		const field = (await w.policy.catalogue()).find(
			/** Match the reference. */ (item) => item.ref === ref,
		)
		if (!field) throw new HcmDomainError('not-found')
		return field
	}

	/** Lock a custom field and require its revision. */
	private async lockedField(
		w: EmployeeWork,
		id: string,
		expected: number,
	): Promise<CustomFieldDefinitionDto> {
		const revision = await w.policy.lockCustomField(id)
		if (revision === undefined) throw new HcmDomainError('not-found')
		if (revision !== expected) throw new HcmDomainError('revision-conflict')
		const field = await w.policy.customField(id)
		if (!field) throw new HcmDomainError('not-found')
		return field
	}

	/** Assemble the detail DTO from the current transaction state. */
	private async read(w: EmployeeWork, ref: ProfileFieldRef): Promise<ProfileFieldDetailDto> {
		const field = await this.field(w, ref)
		const customId = field.custom ? ref.slice('custom:'.length) : null
		const effective = (await w.visibility.effective(null)).get(ref) ?? null
		const policy = field.tenantPolicy ?? field.productDefault
		return {
			...field,
			description: await w.policy.description(ref),
			customField: customId ? ((await w.policy.customField(customId)) ?? null) : null,
			hasValues: customId ? await w.policy.hasValues(customId) : false,
			policyRevision: field.tenantPolicy?.revision ?? 0,
			effectiveVisibility: effective,
			preview: PREVIEW_RELATIONS.map(
				/** What one relation receives. */ (relation) => {
					const visible = effective !== null && field.active && relationSees(relation, effective)
					return {
						relation,
						visible,
						editMode:
							relation === 'Self' && visible ? (policy?.selfEditMode ?? 'NotEditable') : null,
					}
				},
			),
		}
	}

	/** Append an HCM-2 audit event with field names only. */
	private audit(
		w: EmployeeWork,
		action: string,
		ref: ProfileFieldRef,
		requestId: string,
		reason: string,
		fields: string[],
	): Promise<string> {
		return w.audit.append({
			action,
			category: 'business',
			targetType: ref.startsWith('custom:') ? 'custom-field' : 'profile-field',
			targetId: ref,
			requestId,
			summary: { reason, changedFields: fields, fromState: null, toState: null },
		})
	}

	/** Serialize a configuration write and replay identical retries from the actor's receipt. */
	private command<T>(
		context: AuthenticatedHcmContext,
		operation: string,
		target: string,
		payload: unknown,
		key: string,
		work: (w: EmployeeWork) => Promise<T>,
	): Promise<T> {
		const hash = commandHash(target, payload)
		return this.unit.execute(
			context,
			MANAGE,
			true,
			/** Keep receipts in the business transaction. */ (w) =>
				runIdempotent(w.receipts, operation, key, hash, /** Run once. */ () => work(w)),
		)
	}
}
