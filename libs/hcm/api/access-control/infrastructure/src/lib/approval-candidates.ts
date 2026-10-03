import { sql, type Kysely } from 'kysely'
import {
	ApprovalCandidateBinder,
	grantCoversSubject,
	type ApprovalCandidatePort,
	type ApprovalCandidateQuery,
	type HcmGrantScope,
} from '@empflowyee/hcm-api-access-control-application'
import { commandHash } from '@empflowyee/hcm-api-runtime-application'
import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'

interface CandidateGrant {
	accountId: string
	accountRevision: number
	personId: string | null
	grantId: string
	scopes: HcmGrantScope[]
}

class SqlApprovalCandidates implements ApprovalCandidatePort {
	/** Retain the caller's explicit tenant binding, without a session or permission bypass. */
	constructor(
		private readonly executor: Kysely<unknown>,
		private readonly tenantId: string,
	) {}
	/** Require the transaction-local tenant before reading enabled account or grant facts. */
	private async requireTenant() {
		const row = (
			await sql<{ tenant: string | null }>`SELECT hcm.current_tenant_id() AS tenant`.execute(
				this.executor,
			)
		).rows[0]
		if (row.tenant !== this.tenantId) throw new Error('Approval candidate tenant mismatch')
	}
	/** Resolve beneficiary accounts solely for source-owned independence checks. */
	async accountsForPerson(personId: string): Promise<string[]> {
		idValue(personId, 'personId')
		await this.requireTenant()
		return (
			await sql<{
				id: string
			}>`SELECT id FROM hcm.user_account WHERE tenant_id=${this.tenantId} AND person_id=${personId} ORDER BY id COLLATE "C"`.execute(
				this.executor,
			)
		).rows.map(/** Return identifiers only, never identity profile data. */ (row) => row.id)
	}
	/** Evaluate one complete current grant per candidate; separate grants cannot combine scopes. */
	async discover(query: ApprovalCandidateQuery) {
		await this.requireTenant()
		if (!query.subjects.length || query.subjects.length > 366)
			throw new HcmDomainError('record-incomplete')
		for (const id of [
			...(query.accountIds ?? []),
			...(query.personIds ?? []),
			...query.excludedAccountIds,
		])
			idValue(id, 'candidateId')
		const rows = (
			await sql<CandidateGrant>`SELECT a.id AS "accountId",a.revision AS "accountRevision",a.person_id AS "personId",g.grant_id AS "grantId",
  coalesce((SELECT jsonb_agg(jsonb_build_object('dimension',CASE s.scope_kind WHEN 'Tenant' THEN 'tenant' WHEN 'LegalEntity' THEN 'legalEntityId' WHEN 'OrgUnit' THEN 'orgUnitId' WHEN 'Department' THEN 'departmentId' WHEN 'Location' THEN 'locationId' WHEN 'Assignment' THEN 'assignmentId' WHEN 'Employment' THEN 'employmentId' END,'targetId',CASE s.scope_kind WHEN 'Tenant' THEN s.tenant_id ELSE coalesce(s.legal_entity_id,s.org_unit_id,s.department_id,s.location_id,s.assignment_id,s.employment_id) END) ORDER BY s.id COLLATE "C") FROM hcm.account_role_scope s WHERE s.tenant_id=g.tenant_id AND s.grant_id=g.grant_id),'[]'::jsonb) AS scopes
  FROM hcm.user_account a JOIN hcm.account_role g ON g.tenant_id=a.tenant_id AND g.account_id=a.id
  JOIN hcm.role_permission p ON p.tenant_id=g.tenant_id AND p.role_id=g.role_id
  JOIN hcm.access_permission d ON d.tenant_id=p.tenant_id AND d.code=p.permission_code
  JOIN hcm.tenant t ON t.id=a.tenant_id
  WHERE a.tenant_id=${this.tenantId} AND a.enabled AND t.status IN ('active','trial','grace') AND d.kind='business-operation' AND p.permission_code=${query.permission}
  AND EXISTS(SELECT 1 FROM hcm.tenant_entitlement e WHERE e.tenant_id=a.tenant_id AND e.code=${query.entitlement} AND e.enabled)
  ORDER BY a.id COLLATE "C",g.grant_id COLLATE "C"`.execute(this.executor)
		).rows
		const eligible = rows.filter(
			/** Apply source routing and independence before one complete operation grant. */ (row) =>
				(query.accountIds === undefined || query.accountIds.includes(row.accountId)) &&
				(query.personIds === undefined ||
					(row.personId !== null && query.personIds.includes(row.personId))) &&
				!query.excludedAccountIds.includes(row.accountId) &&
				query.subjects.every(
					/** Each dated member must be covered by this same grant. */ (subject) =>
						grantCoversSubject(row.scopes, this.tenantId, subject),
				),
		)
		const accountIds = [
			...new Set(
				eligible.map(
					/** Deduplicate multiple independently complete grants. */ (row) => row.accountId,
				),
			),
		]
		if (accountIds.length > 100) throw new HcmDomainError('record-incomplete')
		return {
			accountIds,
			digest: commandHash('ApprovalCandidateSnapshot:1', {
				tenantId: this.tenantId,
				query,
				eligible,
			}),
		}
	}
}

/** Access owns current grant discovery; source-owned routing remains a separate filter. */
export class KyselyApprovalCandidateBinder extends ApprovalCandidateBinder {
	/** Bind only the source transaction, preserving tenant RLS and owner boundaries. */
	bind(transaction: unknown, tenantId: string): ApprovalCandidatePort {
		idValue(tenantId, 'tenantId')
		const executor = transaction as Kysely<unknown>
		if (!executor?.isTransaction)
			throw new Error('Approval candidate discovery requires a tenant transaction')
		return new SqlApprovalCandidates(executor, tenantId)
	}
}
