import type {
	AuthenticatedHcmContext,
	CommandReceiptStore,
} from '@empflowyee/hcm-api-runtime-application'
import type { AppendAudit } from '@empflowyee/hcm-api-audit-application'
import type { CatalogueReader } from './catalogue-repository'

/** Job architecture adapters bound to one authorized tenant transaction. */
export interface JobArchitectureWork {
	/** The verified actor of the transaction. */
	accountId: string
	catalogue: CatalogueReader
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
