import { sql, type Kysely, type RawBuilder } from 'kysely'
import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'
import {
	leavePolicyPublicationErrors,
	readLeavePolicyDraft,
	type LeavePolicyDraft,
	type LeavePolicyVersionView,
} from '@empflowyee/hcm-leave-contract'
import type {
	LeavePolicyRepository,
	LeavePolicyVersionInsert,
} from '@empflowyee/hcm-api-leave-application'

type Fields = Readonly<Record<string, string>>
const VERSION_FIELDS: Fields = {
	name: 'name',
	description: 'description',
	effectiveFrom: 'effective_from',
	effectiveTo: 'effective_to',
	trackingMode: 'tracking_mode',
	standardDayMinutes: 'standard_day_minutes',
	hourlyIncrementMinutes: 'hourly_increment_minutes',
	allowHalfDay: 'allow_half_day',
	allowHourly: 'allow_hourly',
	maximumBackdatedDays: 'maximum_backdated_days',
	maximumAdvanceDays: 'maximum_advance_days',
	minimumRequestUnits: 'minimum_request_units',
	maximumRequestUnits: 'maximum_request_units',
	noticeDays: 'notice_days',
	noticeMode: 'notice_mode',
	evidenceAfterConsecutiveDays: 'evidence_after_consecutive_days',
	bridgeRule: 'bridge_rule',
	allowOverlap: 'allow_overlap',
	negativeBalanceAllowed: 'negative_balance_allowed',
	postingPoint: 'posting_point',
}
const ELIGIBILITY_FIELDS: Fields = {
	id: 'id',
	priority: 'priority',
	effect: 'effect',
	effectiveFrom: 'effective_from',
	effectiveTo: 'effective_to',
	legalEntityId: 'legal_entity_id',
	orgUnitId: 'org_unit_id',
	departmentId: 'department_id',
	locationId: 'location_id',
	workerTypeId: 'worker_type_id',
	employmentType: 'employment_type',
	genderCode: 'gender_code',
	minimumServiceDays: 'minimum_service_days',
	statutoryFloorReference: 'statutory_floor_reference',
}
const ASSIGNMENT_FIELDS: Fields = {
	id: 'id',
	employmentId: 'employment_id',
	effect: 'effect',
	effectiveFrom: 'effective_from',
	effectiveTo: 'effective_to',
}
const APPROVAL_FIELDS: Fields = {
	id: 'id',
	stage: 'stage',
	roleCode: 'role_code',
	subjectType: 'subject_type',
	independent: 'independent',
	source: 'candidate_source',
	managerLevel: 'manager_level',
	functionCode: 'function_code',
	accountId: 'account_id',
	minimumUnits: 'minimum_units',
	maximumUnits: 'maximum_units',
}
const ACCRUAL_FIELDS: Fields = {
	enabled: 'enabled',
	unitsPerYear: 'units_per_year',
	unitsPerMonth: 'units_per_month',
	unitsPerOccurrence: 'units_per_occurrence',
	frequency: 'frequency',
	timing: 'timing',
	proration: 'proration',
	waitingPeriodDays: 'waiting_period_days',
	maximumAccruedBalanceUnits: 'maximum_accrued_balance_units',
}
const CARRY_FIELDS: Fields = {
	enabled: 'enabled',
	capUnits: 'cap_units',
	expiryDays: 'expiry_days',
	expiryBasis: 'expiry_basis',
}
const COMPOFF_FIELDS: Fields = {
	enabled: 'enabled',
	halfUnitMinutes: 'half_unit_minutes',
	unitMinutes: 'unit_minutes',
	maxUnitsPerDate: 'max_units_per_date',
	claimWindowDays: 'claim_window_days',
	expiryDays: 'expiry_days',
}
const ENCASHMENT_FIELDS: Fields = {
	configured: 'configured',
	annualOnly: 'annual_only',
	maxUnits: 'max_units',
	minimumRetainedUnits: 'minimum_retained_units',
}
const RULES = [
	{
		field: 'eligibilityRules',
		table: 'leave_eligibility_rule',
		columns: ELIGIBILITY_FIELDS,
		many: true,
	},
	{
		field: 'datedAssignments',
		table: 'leave_policy_assignment',
		columns: ASSIGNMENT_FIELDS,
		many: true,
	},
	{ field: 'approvalRules', table: 'leave_approval_rule', columns: APPROVAL_FIELDS, many: true },
	{ field: 'accrual', table: 'leave_accrual_rule', columns: ACCRUAL_FIELDS, many: false },
	{ field: 'carryForward', table: 'leave_carry_forward_rule', columns: CARRY_FIELDS, many: false },
	{ field: 'compOff', table: 'leave_comp_off_rule', columns: COMPOFF_FIELDS, many: false },
	{ field: 'encashment', table: 'leave_encashment_rule', columns: ENCASHMENT_FIELDS, many: false },
] as const

/** Build an allowlisted DTO projection, casting exact quantities and local dates before JSON encoding. */
function projection(fields: Fields, prefix = ''): RawBuilder<unknown> {
	const parts: RawBuilder<unknown>[] = []
	for (const [field, column] of Object.entries(fields)) {
		parts.push(sql`${field}::text`)
		const reference = sql.ref(prefix ? `${prefix}.${column}` : column)
		parts.push(
			column.includes('units') || column === 'effective_from' || column === 'effective_to'
				? sql`${reference}::text`
				: reference,
		)
	}
	return sql`jsonb_strip_nulls(jsonb_build_object(${sql.join(parts)}))`
}
/** Map a validated Leave contract to only the explicitly owned SQL columns. */
function values(fields: Fields, input: object): Record<string, unknown> {
	const result: Record<string, unknown> = {}
	for (const [field, column] of Object.entries(fields))
		result[column] = (input as Record<string, unknown>)[field] ?? null
	return result
}

/** Persist Leave policy drafts in an existing tenant transaction; this adapter never grants authorization or publishes. */
export class KyselyLeavePolicyRepository implements LeavePolicyRepository {
	/** Keep all writes on the caller's transaction and verified tenant/account identity. */
	constructor(
		private readonly transaction: Kysely<unknown>,
		private readonly tenantId: string,
		private readonly accountId: string,
	) {
		if (!transaction.isTransaction) throw new Error('Leave policies require a tenant transaction')
		idValue(tenantId, 'tenantId')
		idValue(accountId, 'accountId')
	}

	/** Reject a binder reused under another tenant before touching any business row. */
	private async requireTenant(): Promise<void> {
		const current = await sql<{
			tenant: string | null
		}>`SELECT hcm.current_tenant_id() AS tenant`.execute(this.transaction)
		if (current.rows[0]?.tenant !== this.tenantId) throw new HcmDomainError('forbidden')
	}

	/** Read purpose-built policy fields and typed rules with exact decimal strings. */
	async read(policyId: string, versionId: string): Promise<LeavePolicyVersionView | null> {
		await this.requireTenant()
		const found = await sql<{
			view: Record<string, unknown>
			version: number
			revision: number
			state: LeavePolicyVersionView['state']
		}>`
SELECT ${projection(VERSION_FIELDS, 'v')} || jsonb_build_object('code',p.code,'leaveTypeId',p.leave_type_id,'unit',v.unit,
'rounding',jsonb_build_object('scale',v.rounding_scale,'mode',v.rounding_mode),
'eligibility',jsonb_strip_nulls(jsonb_build_object('minimumServiceDays',v.minimum_service_days,
'workerTypes',(SELECT coalesce(jsonb_agg(worker_type_id ORDER BY worker_type_id),'[]'::jsonb) FROM hcm.leave_policy_worker_type WHERE tenant_id=v.tenant_id AND version_id=v.id),
'legalEntityIds',(SELECT coalesce(jsonb_agg(legal_entity_id ORDER BY legal_entity_id),'[]'::jsonb) FROM hcm.leave_policy_legal_entity WHERE tenant_id=v.tenant_id AND version_id=v.id))),
'blackoutDates',(SELECT coalesce(jsonb_agg(work_date::text ORDER BY work_date),'[]'::jsonb) FROM hcm.leave_policy_blackout WHERE tenant_id=v.tenant_id AND version_id=v.id)) AS view,
v.version_number AS version,v.revision,v.state
FROM hcm.leave_policy_version v JOIN hcm.leave_policy p ON p.tenant_id=v.tenant_id AND p.id=v.policy_id
WHERE v.tenant_id=${this.tenantId} AND v.policy_id=${policyId} AND v.id=${versionId} FOR SHARE OF v`.execute(
	this.transaction,
)
		const row = found.rows[0]
		if (!row) return null
		for (const rule of RULES) {
			const result = await sql<{
				view: unknown
			}>`SELECT ${projection(rule.columns)} AS view FROM ${sql.table(`hcm.${rule.table}`)} WHERE tenant_id=${this.tenantId} AND version_id=${versionId} ${rule.many ? sql`ORDER BY ordinal` : sql``}`.execute(
				this.transaction,
			)
			row.view[rule.field] = rule.many
				? result.rows.map(
					/** Only the explicit contract projection leaves the adapter. */ (item) => item.view,
				)
				: result.rows[0]?.view
		}
		const draft = readLeavePolicyDraft(row.view)
		return {
			...draft,
			id: policyId,
			versionId,
			version: row.version,
			revision: row.revision,
			state: row.state,
			validation: leavePolicyPublicationErrors(draft),
		}
	}

	/** Serialize mutation of the exact version before projecting its current state. */
	async lock(policyId: string, versionId: string): Promise<LeavePolicyVersionView | null> {
		await this.requireTenant()
		await sql`SELECT id FROM hcm.leave_policy_version WHERE tenant_id=${this.tenantId} AND policy_id=${policyId} AND id=${versionId} FOR UPDATE`.execute(
			this.transaction,
		)
		return this.read(policyId, versionId)
	}

	/** Insert immutable root identity; composite foreign keys enforce type/unit and tenant ownership. */
	async createPolicy(id: string, draft: LeavePolicyDraft): Promise<void> {
		await this.requireTenant()
		await this.insert('leave_policy', {
			id,
			code: draft.code,
			['leave_type_id']: draft.leaveTypeId,
			unit: draft.unit,
			['created_by_account_id']: this.accountId,
		})
	}

	/** Serialize successor ordinals without granting UPDATE on immutable policy identity. */
	async nextVersion(policyId: string): Promise<number> {
		await this.requireTenant()
		await sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([this.tenantId, policyId])},59))`.execute(
			this.transaction,
		)
		const root =
			await sql`SELECT id FROM hcm.leave_policy WHERE tenant_id=${this.tenantId} AND id=${policyId}`.execute(
				this.transaction,
			)
		if (!root.rows.length) throw new HcmDomainError('not-found')
		const result = await sql<{
			next: number
		}>`SELECT coalesce(max(version_number),0)+1 AS next FROM hcm.leave_policy_version WHERE tenant_id=${this.tenantId} AND policy_id=${policyId}`.execute(
			this.transaction,
		)
		return result.rows[0].next
	}

	/** Write the parent then all typed children within the same caller-owned transaction. */
	async insertVersion(input: LeavePolicyVersionInsert): Promise<void> {
		await this.requireTenant()
		const draft = readLeavePolicyDraft(input.draft)
		await this.insert('leave_policy_version', {
			...this.parentValues(draft),
			id: input.id,
			['policy_id']: input.policyId,
			['version_number']: input.version,
			unit: draft.unit,
			['supersedes_id']: input.supersedesId,
			['created_by_account_id']: this.accountId,
		})
		await this.children(input.id, draft)
	}

	/** Replace only a current draft; SQL child guards serialize against publication. */
	async replace(
		policyId: string,
		versionId: string,
		revision: number,
		input: LeavePolicyDraft,
	): Promise<void> {
		const draft = readLeavePolicyDraft(input)
		const current = await this.lock(policyId, versionId)
		if (!current) throw new HcmDomainError('not-found')
		if (current.revision !== revision) throw new HcmDomainError('revision-conflict')
		if (current.state !== 'Draft') throw new HcmDomainError('version-published')
		if (
			current.code !== draft.code ||
			current.leaveTypeId !== draft.leaveTypeId ||
			current.unit !== draft.unit
		)
			throw new HcmDomainError('field-not-editable')
		const changes = Object.entries(this.parentValues(draft)).map(
			/** Parameterize each mutable column's validated value. */ ([column, value]) =>
				sql`${sql.ref(column)}=${value}`,
		)
		await sql`UPDATE hcm.leave_policy_version SET ${sql.join(changes)},revision=revision+1 WHERE tenant_id=${this.tenantId} AND id=${versionId} AND revision=${revision}`.execute(
			this.transaction,
		)
		for (const table of [
			...RULES.map(/** List only Leave-owned typed child tables. */ (rule) => rule.table),
			'leave_policy_worker_type',
			'leave_policy_legal_entity',
			'leave_policy_blackout',
		])
			await sql`DELETE FROM ${sql.table(`hcm.${table}`)} WHERE tenant_id=${this.tenantId} AND version_id=${versionId}`.execute(
				this.transaction,
			)
		await this.children(versionId, draft)
	}

	/** Flatten only the parent's scalar rules; nested configuration remains in typed tables. */
	private parentValues(draft: LeavePolicyDraft): Record<string, unknown> {
		return {
			...values(VERSION_FIELDS, draft),
			['rounding_scale']: draft.rounding.scale,
			['rounding_mode']: draft.rounding.mode,
			['minimum_service_days']: draft.eligibility.minimumServiceDays ?? null,
		}
	}

	/** Insert a closed owner-selected table and column mapping with parameterized values. */
	private async insert(table: string, input: Record<string, unknown>): Promise<void> {
		const row = { ['tenant_id']: this.tenantId, ...input }
		await sql`INSERT INTO ${sql.table(`hcm.${table}`)} (${sql.join(Object.keys(row).map(/** Quote static owner-selected column identities. */ (column) => sql.ref(column)))}) VALUES (${sql.join(Object.values(row).map(/** Bind every value without SQL interpolation. */ (value) => sql`${value}`))})`.execute(
			this.transaction,
		)
	}

	/** Persist optional funding configuration and routing as typed Leave-owned rows. */
	private async children(versionId: string, draft: LeavePolicyDraft): Promise<void> {
		for (const rule of RULES) {
			const entries = rule.many ? (draft[rule.field] as object[]) : [draft[rule.field]]
			for (const [index, entry] of entries.entries())
				await this.insert(rule.table, {
					['version_id']: versionId,
					...(rule.many ? { ordinal: index + 1 } : {}),
					...values(rule.columns, entry),
				})
		}
		for (const workerTypeId of draft.eligibility.workerTypes)
			await this.insert('leave_policy_worker_type', {
				['version_id']: versionId,
				['worker_type_id']: workerTypeId,
			})
		for (const legalEntityId of draft.eligibility.legalEntityIds)
			await this.insert('leave_policy_legal_entity', {
				['version_id']: versionId,
				['legal_entity_id']: legalEntityId,
			})
		for (const workDate of draft.blackoutDates)
			await this.insert('leave_policy_blackout', {
				['version_id']: versionId,
				['work_date']: workDate,
			})
	}
}
