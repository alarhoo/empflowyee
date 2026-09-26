import { sql, type Kysely } from 'kysely'
import type {
	ProfileFieldDto,
	ProfileFieldPolicyDto,
	ProfileFieldRef,
	ProfileSection,
	ProfileSensitivity,
	ProfileVisibility,
	TenantProfileFieldPolicyDto,
} from '@empflowyee/hcm-employee-contract'
import type {
	ProfilePolicyReader,
	ProfilePreferenceRow,
} from '@empflowyee/hcm-api-employee-application'

/** Verified tenant, actor and transaction of an employee unit of work. */
export interface EmployeeScope {
	executor: Kysely<unknown>
	tenantId: string
	accountId: string
}

interface CatalogueRow {
	ref: ProfileFieldRef
	code: string
	name: string
	section: ProfileSection
	sensitivity: ProfileSensitivity
	ceiling: ProfileVisibility
	searchable: boolean
	active: boolean
	sortOrder: number
	custom: boolean
	productDefault: ProfileFieldPolicyDto | null
	tenantPolicy: TenantProfileFieldPolicyDto | null
}

/** Current tenant policy of a field reference as a JSON object, or null. */
const tenantPolicy = (where: ReturnType<typeof sql>) =>
	sql`(SELECT jsonb_build_object('id',t.id,'requiredness',t.requiredness,'visibility',t.visibility,'selfEditMode',t.self_edit_mode,'allowWorkerPreference',t.allow_worker_visibility_preference,'effectiveFromAt',to_char(t.effective_from_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'revision',t.revision) FROM hcm.profile_field_tenant_policy t WHERE ${where} AND t.requiredness_context='WorkforceActivation' AND t.effective_until_at IS NULL)`

/** Reads the product catalogue, tenant narrowing and worker preferences in the caller's transaction. */
export class KyselyProfilePolicyReader implements ProfilePolicyReader {
	/** Bind to the authorized transaction. */
	constructor(private readonly scope: EmployeeScope) {}

	/** Standard fields, then custom fields, each in section order. */
	async catalogue(): Promise<ProfileFieldDto[]> {
		const t = this.scope.tenantId
		const rows = (
			await sql<CatalogueRow>`SELECT ('standard:'||d.code) AS ref,d.code,d.name,d.section_code AS section,d.sensitivity,d.maximum_visibility AS ceiling,d.is_searchable_when_visible AS searchable,d.is_active AS active,d.sort_order AS "sortOrder",false AS custom,
				jsonb_build_object('requiredness',p.requiredness,'visibility',p.visibility,'selfEditMode',p.self_edit_mode,'allowWorkerPreference',p.allow_worker_visibility_preference) AS "productDefault",
				${tenantPolicy(sql`t.tenant_id=${t} AND t.standard_field_code=d.code`)} AS "tenantPolicy"
			FROM hcm.profile_field_definition d JOIN hcm.profile_field_default_policy p ON p.field_code=d.code AND p.requiredness_context='WorkforceActivation'
			UNION ALL
			SELECT ('custom:'||c.id),c.code,c.name,c.section_code,c.sensitivity,CASE c.sensitivity WHEN 'DirectorySafe' THEN 'Organization' WHEN 'Personal' THEN 'Manager' ELSE 'Hr' END,c.is_searchable_when_visible,c.is_active,c.sort_order,true,
				NULL,
				${tenantPolicy(sql`t.tenant_id=${t} AND t.custom_field_id=c.id`)}
			FROM hcm.custom_field_definition c WHERE c.tenant_id=${t}
			ORDER BY custom,"sortOrder",code`.execute(this.scope.executor)
		).rows
		return rows
	}

	/** Current preferences of the given workers. */
	async preferences(workerIds: readonly string[]): Promise<ProfilePreferenceRow[]> {
		if (!workerIds.length) return []
		return (
			await sql<ProfilePreferenceRow>`SELECT worker_id AS "workerId",coalesce('standard:'||standard_field_code,'custom:'||custom_field_id) AS ref,visibility FROM hcm.profile_visibility_preference WHERE tenant_id=${this.scope.tenantId} AND worker_id = ANY(${[...workerIds]}::text[]) AND effective_until_at IS NULL`.execute(
				this.scope.executor,
			)
		).rows
	}
}
