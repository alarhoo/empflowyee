import type { WorkerChoice, WorkerQuery, DocumentPage } from '@empflowyee/hcm-documents-contract'
export interface DocumentWorkforceReader {
	/** Read only bounded worker identities in the verified tenant. */ listWorkers(
		query: WorkerQuery,
	): Promise<DocumentPage<WorkerChoice>>
	/** Resolve the selected tenant worker without requiring an account. */ requireWorker(
		id: string,
	): Promise<{ workerId: string; personId: string }>
	/** Derive own worker exclusively from the verified account linkage. */ resolveOwnWorker(): Promise<{
		workerId: string
		personId: string
	} | null>
}
