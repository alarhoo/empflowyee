import { sql, type Kysely } from 'kysely'
import { Temporal } from '@js-temporal/polyfill'
import {
	WorkflowSourceBinder,
	type WorkflowSourceProjection,
} from '@empflowyee/hcm-api-workflow-application'
import {
	parseDomainApprovalManifest,
	type DomainApprovalManifest,
	type WorkflowSource,
} from '@empflowyee/hcm-workflow-contract'
import type {
	ApprovalCandidateBinder,
	HcmScopeSubject,
} from '@empflowyee/hcm-api-access-control-application'
import type {
	WorkforceTimeContextBinder,
	WorkforceApprovalRoutingBinder,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import { commandHash } from '@empflowyee/hcm-api-runtime-application'
import { idValue } from '@empflowyee/hcm-runtime-contract'

interface SourceCase {
	id: string
	revision: number
	generation: number
	subjectId: string
	subjectRevision: number
	currentSubjectRevision: number
	state: DomainApprovalManifest['safeFacts']['sourceState']
	employmentId: string
	workDate: string
	zone: string
	makerAccountId: string
	requesterAccountId: string
}
interface SourceSlot {
	id: string
	revision: number
	stage: number
	ordinal: number
	independent: boolean
	distinctActors: boolean
	state: 'Pending' | 'Approved' | 'Rejected'
	decidedBy: string | null
	ruleId: string
	candidateSource: 'LineManager' | 'ManagerLevel' | 'NamedUser' | 'Function'
	managerLevel: number | null
	accountId: string | null
	functionCode: string | null
}

class AttendanceWorkflowProjection implements WorkflowSourceProjection {
	/** Retain the source transaction and ports; no account/session is synthesized for background work. */
	constructor(
		private readonly tx: Kysely<unknown>,
		private readonly tenantId: string,
		private readonly workforce: WorkforceTimeContextBinder,
		private readonly routing: WorkforceApprovalRoutingBinder,
		private readonly access: ApprovalCandidateBinder,
	) {}
	/** Lock the source case against decisions while a consistent manifest/candidate projection is read. */
	private async readCase(caseId: string): Promise<SourceCase | null> {
		idValue(caseId, 'caseId')
		const row = (
			await sql<SourceCase>`SELECT c.id,c.revision,c.generation,c.schedule_override_id AS "subjectId",c.subject_revision AS "subjectRevision",o.revision AS "currentSubjectRevision",c.state,c.employment_id AS "employmentId",c.work_date::text AS "workDate",o.zone,o.created_by_account_id AS "makerAccountId",c.requested_by_account_id AS "requesterAccountId"
  FROM hcm.attendance_approval_case c JOIN hcm.schedule_override o ON o.tenant_id=c.tenant_id AND o.id=c.schedule_override_id
  WHERE c.tenant_id=${this.tenantId} AND c.tenant_id=hcm.current_tenant_id() AND c.id=${caseId} FOR SHARE OF c`.execute(
				this.tx,
			)
		).rows[0]
		return row ?? null
	}
	/** Preserve the exact policy rule per slot, while projecting per-stage ordinals for the Workflow contract. */
	private async slots(caseId: string): Promise<SourceSlot[]> {
		return (
			await sql<SourceSlot>`SELECT s.id,s.revision,s.stage,(row_number() OVER(PARTITION BY s.stage ORDER BY s.ordinal))::int AS ordinal,s.independent,s.distinct_actors AS "distinctActors",s.state,s.decided_by_account_id AS "decidedBy",r.id AS "ruleId",r.candidate_source AS "candidateSource",r.manager_level AS "managerLevel",r.account_id AS "accountId",r.function_code AS "functionCode"
  FROM hcm.attendance_approval_slot s JOIN hcm.attendance_approval_rule r ON r.tenant_id=s.tenant_id AND r.id=s.rule_id AND r.version_id=s.attendance_policy_version_id
  WHERE s.tenant_id=${this.tenantId} AND s.case_id=${caseId} ORDER BY s.stage,s.ordinal`.execute(
				this.tx,
			)
		).rows
	}
	/** Read fresh safe source facts; a missing or changed pending source remains unavailable. */
	async manifest(caseId: string): Promise<DomainApprovalManifest | null> {
		const source = await this.readCase(caseId)
		if (
			!source ||
			(source.state === 'Pending' && source.subjectRevision !== source.currentSubjectRevision)
		)
			return null
		const basis = await this.workforce
			.bind(this.tx, this.tenantId)
			.read(source.employmentId, source.workDate)
		if (basis.state !== 'Available') return null
		const primary = basis.context.assignments.filter(
			/** Retain only an unambiguous safe organisation projection. */ (assignment) =>
				assignment.isPrimary,
		)
		return parseDomainApprovalManifest({
			schemaVersion: 1,
			registryVersion: 1,
			source: 'Attendance',
			caseId: source.id,
			caseRevision: source.revision,
			subjectId: source.subjectId,
			subjectRevision: source.subjectRevision,
			generation: source.generation,
			completion: 'AllRequiredAnyReject',
			allowedActions: ['Approve', 'Reject'],
			registeredRouteCode: 'WORK_SCHEDULES',
			safeFacts: {
				subjectType: 'Override',
				dateFrom: source.workDate,
				dateTo: source.workDate,
				legalEntityId: basis.context.legalEntityId,
				sourceState: source.state,
				...(primary.length === 1 ? { orgUnitId: primary[0].orgUnitId } : {}),
			},
			slots: (await this.slots(caseId)).map(
				/** Preserve mandatory source obligations without exposing routing identities or private narrative. */ (
					slot,
				) => ({
					id: slot.id,
					revision: slot.revision,
					state: slot.state,
					stage: slot.stage,
					ordinal: slot.ordinal,
					independent: slot.independent,
					distinctActors: slot.distinctActors,
					candidateRuleCode: slot.ruleId,
				}),
			),
		})
	}
	/** Resolve selectors against current reporting/Access facts, then exclude maker, requester, beneficiary and prior distinct actors. */
	async candidates(caseId: string, slotId: string) {
		idValue(slotId, 'slotId')
		const source = await this.readCase(caseId),
			slots = source ? await this.slots(caseId) : []
		const slot = slots.find(
			/** Select only the exact source-owned obligation. */ (value) => value.id === slotId,
		)
		const unavailable = {
			accountIds: [],
			digest: commandHash('AttendanceCandidatesUnavailable:1', {
				tenantId: this.tenantId,
				caseId,
				slotId,
			}),
		}
		if (
			!source ||
			!slot ||
			source.state !== 'Pending' ||
			slot.state !== 'Pending' ||
			source.subjectRevision !== source.currentSubjectRevision
		)
			return unavailable
		const basis = await this.workforce
			.bind(this.tx, this.tenantId)
			.read(source.employmentId, source.workDate)
		if (basis.state !== 'Available') return unavailable
		let level: number | null = null
		if (slot.candidateSource === 'LineManager') level = 1
		if (slot.candidateSource === 'ManagerLevel') level = slot.managerLevel
		const asOf = Temporal.Now.instant().toZonedDateTimeISO(source.zone).toPlainDate().toString()
		const routing = await this.routing
			.bind(this.tx, this.tenantId)
			.read(source.employmentId, asOf, level)
		if (!routing) return unavailable
		const access = this.access.bind(this.tx, this.tenantId),
			excluded = new Set<string>()
		if (slot.independent) {
			excluded.add(source.makerAccountId)
			excluded.add(source.requesterAccountId)
			for (const account of await access.accountsForPerson(routing.beneficiaryPersonId))
				excluded.add(account)
		}
		for (const prior of slots)
			if (prior.id !== slot.id && prior.decidedBy && (slot.distinctActors || prior.distinctActors))
				excluded.add(prior.decidedBy)
		const subjects: HcmScopeSubject[] = basis.context.assignments.map(
			/** Preserve whole assignment scope dimensions for one complete grant. */ (assignment) => ({
				employmentId: source.employmentId,
				legalEntityId: basis.context.legalEntityId,
				assignmentId: assignment.id,
				orgUnitId: assignment.orgUnitId,
				locationId: assignment.locationId,
				...(assignment.departmentId ? { departmentId: assignment.departmentId } : {}),
			}),
		)
		let accountIds: string[] | undefined, personIds: string[] | undefined
		if (level !== null) personIds = routing.managerPersonId ? [routing.managerPersonId] : []
		if (slot.candidateSource === 'NamedUser') accountIds = slot.accountId ? [slot.accountId] : []
		// Logical function names are mapped only by the owning approved access model.
		if (slot.candidateSource === 'Function' && slot.functionCode !== 'ATTENDANCE_APPROVAL_ACT')
			return unavailable
		const result = await access.discover({
			permission: 'hcm.attendance.approve-attendance.decide',
			entitlement: 'hcm.attendance',
			subjects,
			...(accountIds ? { accountIds } : {}),
			...(personIds ? { personIds } : {}),
			excludedAccountIds: [...excluded].sort(),
		})
		return {
			accountIds: result.accountIds,
			digest: commandHash('AttendanceApprovalCandidates:1', {
				caseId,
				slotId,
				caseRevision: source.revision,
				workforce: basis.context.inputDigest,
				routing: routing.digest,
				access: result.digest,
			}),
		}
	}
}

/** Attendance projects its own approval cases; Workflow never reads Attendance persistence directly. */
export class KyselyAttendanceWorkflowSourceBinder extends WorkflowSourceBinder {
	/** Compose current owner ports for dated scope, reporting facts and operation grants. */
	constructor(
		private readonly workforce: WorkforceTimeContextBinder,
		private readonly routing: WorkforceApprovalRoutingBinder,
		private readonly access: ApprovalCandidateBinder,
	) {
		super()
	}
	/** Restrict this adapter to Attendance; composition must supply a separate Leave owner when admitted. */
	bind(transaction: unknown, tenantId: string, source: WorkflowSource): WorkflowSourceProjection {
		idValue(tenantId, 'tenantId')
		const tx = transaction as Kysely<unknown>
		if (!tx?.isTransaction || source !== 'Attendance')
			throw new Error('Attendance source requires its registered tenant transaction')
		return new AttendanceWorkflowProjection(tx, tenantId, this.workforce, this.routing, this.access)
	}
}
