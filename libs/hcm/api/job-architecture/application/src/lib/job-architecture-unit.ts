import type {
	AuthenticatedHcmContext,
	BoundFieldCipher,
	CommandReceiptStore,
} from '@empflowyee/hcm-api-runtime-application'
import type {
	PositionOccupancyPort,
	StructureReferencePort,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import type { AppendAudit } from '@empflowyee/hcm-api-audit-application'
import type { CatalogueRepository } from './job-catalogue'
import type { PositionRepository } from './position-repository'

/** Job architecture adapters bound to one authorized tenant transaction. */
export interface JobArchitectureWork {
	/** The verified actor of the transaction. */
	accountId: string
	catalogue: CatalogueRepository
	positions: PositionRepository
	/** Field encryption bound to the same tenant transaction. */
	cipher: BoundFieldCipher
	/** Workforce structure references, read in the same transaction. */
	structure: StructureReferencePort
	/** Workforce position occupancy, read in the same transaction. */
	occupancy: PositionOccupancyPort
	/** Whether the actor also holds another job architecture permission, e.g. `positions.approve`. */
	holds(permission: string): Promise<boolean>
	receipts: CommandReceiptStore
	audit: AppendAudit
	/** Today's business date in the organisation time zone. */
	today: string
}

export abstract class JobArchitectureUnitOfWork {
	/** Reauthorize a job architecture permission and bind adapters to one tenant transaction. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		permission: string,
		write: boolean,
		work: (scope: JobArchitectureWork) => Promise<T>,
	): Promise<T>
}
