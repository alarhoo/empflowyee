import type {
	AuthenticatedHcmContext,
	CommandReceiptStore,
} from '@empflowyee/hcm-api-runtime-application'
import type { AppendAudit } from '@empflowyee/hcm-api-audit-application'
import type {
	StructureReferencePort,
	WorkforceDirectoryPort,
	WorkforceFactsPort,
	WorkforceProfilePort,
	WorkforceReadPort,
	WorkforceRecordsPort,
	WorkforceChangeContextPort,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import type { PositionReadPort } from '@empflowyee/hcm-api-job-architecture-application'
import type { EmploymentChangeRepository } from './employment-change-repository'
import type { EmployeeImportRepository } from './employee-import-repository'
import type { ProbationRepository } from './probation-repository'
import type { ImportSourceStore } from '@empflowyee/hcm-api-documents-application'
import type { SelfServiceRepository } from './my-profile'
import type { ProfilePolicyRepository } from './profile-configuration'
import type { ProfileFieldVisibilityPort } from './profile-visibility-port'
import type { TeamScopeResolver } from './team-scope'

/** Employee adapters bound to one authorized tenant transaction. */
export interface EmployeeWork {
	/** The verified actor of the transaction. */
	accountId: string
	policy: ProfilePolicyRepository
	visibility: ProfileFieldVisibilityPort
	team: TeamScopeResolver
	/** Workforce projections read inside the same transaction. */
	reads: WorkforceReadPort
	/** Current-workforce projections for the directories. */
	directory: WorkforceDirectoryPort
	/** The worker's own facts and the self-service person commands. */
	profile: WorkforceProfilePort
	/** Typed workforce commands for creation, correction and merge. */
	facts: WorkforceFactsPort
	/** Tenant-wide worker records and address corrections for HR. */
	records: WorkforceRecordsPort
	/** Structure options and reference checks. */
	structure: StructureReferencePort
	/** Current facts and locks for employment change requests. */
	changes: WorkforceChangeContextPort
	/** Employee-owned employment change requests, approvals and execution steps. */
	changeRequests: EmploymentChangeRepository
	/** Published positions and capacity decisions (DEC-HCM2-007). */
	positions: PositionReadPort
	/** Employee-owned import templates, runs, rows and issues. */
	imports: EmployeeImportRepository
	/** Import source files, staged and read through documents. */
	sources: ImportSourceStore
	/** Employee-owned probation reviews, assessments and decisions. */
	probation: ProbationRepository
	/** Whether the actor holds one more employee business grant, such as `changes.approve`. */
	holds(permission: string): Promise<boolean>
	/** Employee-owned custom values and visibility preferences. */
	selfService: SelfServiceRepository
	receipts: CommandReceiptStore
	audit: AppendAudit
	/** Today's business date in the organisation time zone. */
	today: string
}

export abstract class EmployeeUnitOfWork {
	/** Reauthorize an employee permission and bind adapters to one tenant transaction. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		permission: string,
		write: boolean,
		work: (scope: EmployeeWork) => Promise<T>,
	): Promise<T>
}
