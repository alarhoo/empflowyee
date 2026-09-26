import { sql, type RawBuilder } from 'kysely'
import { classifyConstraint } from '@empflowyee/hcm-api-database-kysely'
import type {
	CustomFieldCreate,
	CustomFieldDefinitionDto,
	CustomFieldOptionInput,
	CustomFieldOptionUpdate,
	CustomFieldUpdate,
	ProfileFieldPolicyDto,
	ProfileFieldRef,
	RequirednessContext,
} from '@empflowyee/hcm-employee-contract'
import { KyselyProfilePolicyReader } from './profile-policy-reader'

/** Split a field reference into its standard code or custom id column predicate. */
function refColumn(ref: ProfileFieldRef): RawBuilder<unknown> {
	return ref.startsWith('standard:')
		? sql`standard_field_code=${ref.slice('standard:'.length)}`
		: sql`custom_field_id=${ref.slice('custom:'.length)}`
}

/** Tenant profile policy and custom field persistence inside the caller's transaction. */
/** Checked structurally against `ProfilePolicyRepository` where the unit of work binds it. */
export class KyselyProfilePolicyRepository extends KyselyProfilePolicyReader {
	/** Execute one statement and classify integrity failures safely. */
	private async run<T>(query: RawBuilder<T>): Promise<T[]> {
		try {
			return (await query.execute(this.scope.executor)).rows
		} catch (error) {
			return classifyConstraint(error)
		}
	}

	/** Description of a standard or custom field. */
	async description(ref: ProfileFieldRef): Promise<string> {
		let query
		if (ref.startsWith('standard:'))
			query = sql<{
				description: string
			}>`SELECT description FROM hcm.profile_field_definition WHERE code=${ref.slice('standard:'.length)}`
		else
			query = sql<{
				description: string
			}>`SELECT description FROM hcm.custom_field_definition WHERE tenant_id=${this.scope.tenantId} AND id=${ref.slice('custom:'.length)}`
		return (await this.run(query))[0]?.description ?? ''
	}

	/** A custom field with its options in display order. */
	async customField(id: string): Promise<CustomFieldDefinitionDto | undefined> {
		const t = this.scope.tenantId
		return (
			await this.run(
				sql<CustomFieldDefinitionDto>`SELECT c.id,c.code,c.name,c.description,c.owner_scope AS "ownerScope",c.data_type AS "dataType",c.sensitivity,c.section_code AS section,c.is_searchable_when_visible AS searchable,c.is_active AS active,c.sort_order AS "sortOrder",c.revision,
					coalesce((SELECT jsonb_agg(jsonb_build_object('id',o.id,'code',o.code,'name',o.name,'active',o.is_active,'sortOrder',o.sort_order,'revision',o.revision) ORDER BY o.sort_order,o.name COLLATE "C",o.id COLLATE "C") FROM hcm.custom_field_option o WHERE o.tenant_id=c.tenant_id AND o.custom_field_id=c.id),'[]'::jsonb) AS options
				FROM hcm.custom_field_definition c WHERE c.tenant_id=${t} AND c.id=${id}`,
			)
		)[0]
	}

	/** Whether any value was ever stored for a custom field. */
	async hasValues(id: string): Promise<boolean> {
		return (
			(
				await this.run(
					sql<{
						found: boolean
					}>`SELECT EXISTS (SELECT 1 FROM hcm.custom_field_value WHERE tenant_id=${this.scope.tenantId} AND custom_field_id=${id}) AS found`,
				)
			)[0]?.found === true
		)
	}

	/** Lock the current tenant policy row of a field and context. */
	async lockPolicy(
		ref: ProfileFieldRef,
		context: RequirednessContext,
	): Promise<{ id: string; revision: number } | undefined> {
		return (
			await this.run(
				sql<{
					id: string
					revision: number
				}>`SELECT id,revision FROM hcm.profile_field_tenant_policy WHERE tenant_id=${this.scope.tenantId} AND ${refColumn(ref)} AND requiredness_context=${context} AND effective_until_at IS NULL FOR UPDATE`,
			)
		)[0]
	}

	/** Close a current policy row and link its successor. */
	async closePolicy(id: string, successorId: string | null): Promise<void> {
		await this.run(
			sql`UPDATE hcm.profile_field_tenant_policy SET effective_until_at=now(),superseded_by_id=${successorId},updated_at=now(),updated_by_account_id=${this.scope.accountId} WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** Insert the new current policy row. */
	async insertPolicy(input: {
		id: string
		ref: ProfileFieldRef
		context: RequirednessContext
		policy: ProfileFieldPolicyDto
		revision: number
	}): Promise<void> {
		const standard = input.ref.startsWith('standard:') ? input.ref.slice('standard:'.length) : null
		const custom = input.ref.startsWith('custom:') ? input.ref.slice('custom:'.length) : null
		const p = input.policy
		const a = this.scope.accountId
		await this.run(
			sql`INSERT INTO hcm.profile_field_tenant_policy(tenant_id,id,standard_field_code,custom_field_id,requiredness_context,requiredness,visibility,self_edit_mode,allow_worker_visibility_preference,revision,created_by_account_id,updated_by_account_id) VALUES (${this.scope.tenantId},${input.id},${standard},${custom},${input.context},${p.requiredness},${p.visibility},${p.selfEditMode},${p.allowWorkerPreference},${input.revision},${a},${a})`,
		)
	}

	/** Lock a custom field and return its revision. */
	async lockCustomField(id: string): Promise<number | undefined> {
		return (
			await this.run(
				sql<{
					revision: number
				}>`SELECT revision FROM hcm.custom_field_definition WHERE tenant_id=${this.scope.tenantId} AND id=${id} FOR UPDATE`,
			)
		)[0]?.revision
	}

	/** Insert a custom field definition after the standard fields. */
	async createCustomField(id: string, c: CustomFieldCreate): Promise<void> {
		const a = this.scope.accountId
		await this.run(
			sql`INSERT INTO hcm.custom_field_definition(tenant_id,id,code,name,description,owner_scope,data_type,sensitivity,section_code,is_searchable_when_visible,created_by_account_id,updated_by_account_id) VALUES (${this.scope.tenantId},${id},${c.code},${c.name},${c.description},${c.ownerScope},${c.dataType},${c.sensitivity},${c.section},${c.searchable},${a},${a})`,
		)
	}

	/** Insert one option of a select field. */
	async createOption(fieldId: string, optionId: string, o: CustomFieldOptionInput): Promise<void> {
		const a = this.scope.accountId
		await this.run(
			sql`INSERT INTO hcm.custom_field_option(tenant_id,id,custom_field_id,code,name,sort_order,created_by_account_id,updated_by_account_id) VALUES (${this.scope.tenantId},${optionId},${fieldId},${o.code},${o.name},${o.sortOrder},${a},${a})`,
		)
	}

	/** Update the mutable columns of a custom field. */
	async updateCustomField(id: string, u: CustomFieldUpdate): Promise<void> {
		await this.run(
			sql`UPDATE hcm.custom_field_definition SET name=${u.name},description=${u.description},section_code=${u.section},sort_order=${u.sortOrder},is_active=${u.active},revision=revision+1,updated_at=now(),updated_by_account_id=${this.scope.accountId} WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}

	/** Update one option of a field. */
	async updateOption(
		fieldId: string,
		optionId: string,
		u: CustomFieldOptionUpdate,
	): Promise<boolean> {
		return (
			(
				await this.run(
					sql<{
						id: string
					}>`UPDATE hcm.custom_field_option SET name=${u.name},sort_order=${u.sortOrder},is_active=${u.active},revision=revision+1,updated_at=now(),updated_by_account_id=${this.scope.accountId} WHERE tenant_id=${this.scope.tenantId} AND custom_field_id=${fieldId} AND id=${optionId} RETURNING id`,
				)
			).length === 1
		)
	}

	/** Advance a custom field revision after an option change. */
	async touchCustomField(id: string): Promise<void> {
		await this.run(
			sql`UPDATE hcm.custom_field_definition SET revision=revision+1,updated_at=now(),updated_by_account_id=${this.scope.accountId} WHERE tenant_id=${this.scope.tenantId} AND id=${id}`,
		)
	}
}
