import { sql, type RawBuilder } from 'kysely'
import { classifyConstraint } from '@empflowyee/hcm-api-database-kysely'
import type {
	CustomFieldDefinitionDto,
	CustomValue,
	ProfileFieldRef,
	ProfileVisibility,
} from '@empflowyee/hcm-employee-contract'
import type {
	CustomValueOwner,
	CustomValueRow,
	SelfPreferenceRow,
	SelfServiceRepository,
} from '@empflowyee/hcm-api-employee-application'
import type { EmployeeScope } from './profile-policy-reader'

/** The typed value columns of a custom value as one JSON value. */
const VALUE = sql`CASE d.data_type
	WHEN 'Integer' THEN to_jsonb(v.integer_value)
	WHEN 'Decimal' THEN to_jsonb(v.decimal_value::float8)
	WHEN 'Date' THEN to_jsonb(to_char(v.date_value,'YYYY-MM-DD'))
	WHEN 'Boolean' THEN to_jsonb(v.boolean_value)
	WHEN 'SingleSelect' THEN (SELECT to_jsonb(min(o.option_id)) FROM hcm.custom_field_value_option o WHERE o.tenant_id=v.tenant_id AND o.value_id=v.id)
	WHEN 'MultiSelect' THEN (SELECT jsonb_agg(o.option_id ORDER BY o.option_id) FROM hcm.custom_field_value_option o WHERE o.tenant_id=v.tenant_id AND o.value_id=v.id)
	ELSE to_jsonb(v.text_value) END`

/** The scalar column values of a custom value; selects store options separately. */
function columns(field: CustomFieldDefinitionDto, value: CustomValue) {
	return {
		text: field.dataType === 'Text' || field.dataType === 'LongText' ? value : null,
		integer: field.dataType === 'Integer' ? value : null,
		decimal: field.dataType === 'Decimal' ? value : null,
		date: field.dataType === 'Date' ? value : null,
		boolean: field.dataType === 'Boolean' ? value : null,
	}
}

/** Selected option ids of a select value. */
function optionIds(value: CustomValue): string[] {
	if (Array.isArray(value)) return value
	return typeof value === 'string' ? [value] : []
}

/** Employee-owned custom values and visibility preferences inside the caller's transaction. */
export class KyselySelfServiceRepository implements SelfServiceRepository {
	/** Bind to the authorized transaction. */
	constructor(private readonly scope: EmployeeScope) {}

	/** Execute one statement and classify integrity failures safely. */
	private async run<T>(query: RawBuilder<T>): Promise<T[]> {
		try {
			return (await query.execute(this.scope.executor)).rows
		} catch (error) {
			return classifyConstraint(error)
		}
	}

	/** Active custom field definitions with every option, in display order. */
	async customFields(): Promise<CustomFieldDefinitionDto[]> {
		return this.run(
			sql<CustomFieldDefinitionDto>`SELECT c.id,c.code,c.name,c.description,c.owner_scope AS "ownerScope",c.data_type AS "dataType",c.sensitivity,c.section_code AS section,c.is_searchable_when_visible AS searchable,c.is_active AS active,c.sort_order AS "sortOrder",c.revision,
				coalesce((SELECT jsonb_agg(jsonb_build_object('id',o.id,'code',o.code,'name',o.name,'active',o.is_active,'sortOrder',o.sort_order,'revision',o.revision) ORDER BY o.sort_order,o.name COLLATE "C",o.id COLLATE "C") FROM hcm.custom_field_option o WHERE o.tenant_id=c.tenant_id AND o.custom_field_id=c.id),'[]'::jsonb) AS options
			FROM hcm.custom_field_definition c WHERE c.tenant_id=${this.scope.tenantId} AND c.is_active ORDER BY c.sort_order,c.name COLLATE "C",c.id COLLATE "C"`,
		)
	}

	/** Custom values in force on a date for the given owners. */
	async customValues(owners: readonly CustomValueOwner[], asOf: string): Promise<CustomValueRow[]> {
		const ids = owners.map(/** Owner id. */ (owner) => owner.id)
		return this.run(
			sql<CustomValueRow>`SELECT v.id,v.custom_field_id AS "fieldId",coalesce(v.person_id,v.worker_id,v.employment_id,v.assignment_id) AS "ownerId",${VALUE} AS value,to_char(v.effective_from,'YYYY-MM-DD') AS "effectiveFrom",v.revision
				FROM hcm.custom_field_value v JOIN hcm.custom_field_definition d ON d.tenant_id=v.tenant_id AND d.id=v.custom_field_id
				WHERE v.tenant_id=${this.scope.tenantId} AND coalesce(v.person_id,v.worker_id,v.employment_id,v.assignment_id) = ANY(${ids}::text[]) AND v.effective_period @> ${asOf}::date`,
		)
	}

	/** Lock the value of a field and owner in force on a date. */
	async lockCustomValue(
		fieldId: string,
		owner: CustomValueOwner,
		asOf: string,
	): Promise<CustomValueRow | undefined> {
		return (
			await this.run(
				sql<CustomValueRow>`SELECT v.id,v.custom_field_id AS "fieldId",${owner.id} AS "ownerId",${VALUE} AS value,to_char(v.effective_from,'YYYY-MM-DD') AS "effectiveFrom",v.revision
					FROM hcm.custom_field_value v JOIN hcm.custom_field_definition d ON d.tenant_id=v.tenant_id AND d.id=v.custom_field_id
					WHERE v.tenant_id=${this.scope.tenantId} AND v.custom_field_id=${fieldId} AND ${sql.ref('v.' + owner.column)}=${owner.id} AND v.effective_period @> ${asOf}::date
					FOR UPDATE OF v`,
			)
		)[0]
	}

	/** Link the selected options of a select value. */
	private async linkOptions(valueId: string, value: CustomValue): Promise<void> {
		for (const optionId of optionIds(value))
			await this.run(
				sql`INSERT INTO hcm.custom_field_value_option(tenant_id,value_id,option_id,created_by_account_id) VALUES(${this.scope.tenantId},${valueId},${optionId},${this.scope.accountId})`,
			)
	}

	/** Record a value from a date. */
	async insertCustomValue(input: {
		id: string
		field: CustomFieldDefinitionDto
		owner: CustomValueOwner
		value: CustomValue
		effectiveFrom: string
	}): Promise<void> {
		const c = columns(input.field, input.value)
		/** The owner id in its own column, null elsewhere. */
		const owner = (column: CustomValueOwner['column']) =>
			input.owner.column === column ? input.owner.id : null
		const a = this.scope.accountId
		await this.run(
			sql`INSERT INTO hcm.custom_field_value(tenant_id,id,custom_field_id,person_id,worker_id,employment_id,assignment_id,text_value,integer_value,decimal_value,date_value,boolean_value,effective_from,created_by_account_id,updated_by_account_id)
				VALUES(${this.scope.tenantId},${input.id},${input.field.id},${owner('person_id')},${owner('worker_id')},${owner('employment_id')},${owner('assignment_id')},${c.text},${c.integer},${c.decimal},${c.date}::date,${c.boolean},${input.effectiveFrom}::date,${a},${a})`,
		)
		await this.linkOptions(input.id, input.value)
	}

	/** Replace a value recorded today in place. */
	async replaceCustomValue(
		id: string,
		field: CustomFieldDefinitionDto,
		value: CustomValue,
	): Promise<void> {
		const c = columns(field, value)
		await this.run(
			sql`UPDATE hcm.custom_field_value SET text_value=${c.text},integer_value=${c.integer},decimal_value=${c.decimal},date_value=${c.date}::date,boolean_value=${c.boolean},revision=revision+1,updated_at=now(),updated_by_account_id=${this.scope.accountId} WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
		await this.run(
			sql`DELETE FROM hcm.custom_field_value_option WHERE tenant_id=${this.scope.tenantId} AND value_id=${id}`,
		)
		await this.linkOptions(id, value)
	}

	/** End a value, linking the successor when one exists. */
	async closeCustomValue(
		id: string,
		effectiveTo: string,
		successorId: string | null,
	): Promise<void> {
		await this.run(
			sql`UPDATE hcm.custom_field_value SET effective_to=${effectiveTo}::date,superseded_by_id=${successorId},updated_at=now(),updated_by_account_id=${this.scope.accountId} WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** The worker's current preferences. */
	async selfPreferences(workerId: string): Promise<SelfPreferenceRow[]> {
		return this.run(
			sql<SelfPreferenceRow>`SELECT id,coalesce('standard:'||standard_field_code,'custom:'||custom_field_id) AS ref,visibility,revision FROM hcm.profile_visibility_preference WHERE tenant_id=${this.scope.tenantId} AND worker_id=${workerId} AND effective_until_at IS NULL`,
		)
	}

	/** Close a current preference. */
	async closePreference(id: string, successorId: string | null): Promise<void> {
		await this.run(
			sql`UPDATE hcm.profile_visibility_preference SET effective_until_at=now(),superseded_by_id=${successorId},updated_at=now(),updated_by_account_id=${this.scope.accountId} WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** Insert the new current preference. */
	async insertPreference(input: {
		id: string
		workerId: string
		ref: ProfileFieldRef
		visibility: ProfileVisibility
		revision: number
	}): Promise<void> {
		const standard = input.ref.startsWith('standard:') ? input.ref.slice('standard:'.length) : null
		const custom = input.ref.startsWith('custom:') ? input.ref.slice('custom:'.length) : null
		const a = this.scope.accountId
		await this.run(
			sql`INSERT INTO hcm.profile_visibility_preference(tenant_id,id,worker_id,standard_field_code,custom_field_id,visibility,revision,created_by_account_id,updated_by_account_id) VALUES(${this.scope.tenantId},${input.id},${input.workerId},${standard},${custom},${input.visibility},${input.revision},${a},${a})`,
		)
	}
}
