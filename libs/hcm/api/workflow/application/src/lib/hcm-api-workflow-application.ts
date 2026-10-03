import {
	parseDomainApprovalManifest,
	type DomainApprovalManifest,
	type WorkflowSource,
} from '@empflowyee/hcm-workflow-contract'
import { commandHash } from '@empflowyee/hcm-api-runtime-application'

/** A durable intake reference is coordination status, never a source approval result. */
export interface WorkflowIntakeResult {
	operationId: string
	state: 'Queued'
	manifestDigest: string
}
export interface WorkflowIntakePort {
	/** Store validated source identity and digest atomically with the source case. */
	enqueue(manifest: DomainApprovalManifest): Promise<WorkflowIntakeResult>
}
export abstract class WorkflowIntakeBinder {
	/** Bind to the source's authorized live tenant transaction; a pool or caller-supplied session is insufficient. */
	abstract bind(transaction: unknown, tenantId: string): WorkflowIntakePort
}
export interface WorkflowSourceProjection {
	/** Read fresh source requirements under the verified workload transaction. */
	manifest(caseId: string): Promise<DomainApprovalManifest | null>
	/** Resolve current source candidates; a persisted Workflow candidate is never authoritative. */
	candidates(caseId: string, slotId: string): Promise<{ accountIds: string[]; digest: string }>
}
export abstract class WorkflowSourceBinder {
	/** Compose only fixed registered source adapters, without arbitrary URLs or dynamic SQL owners. */
	abstract bind(
		transaction: unknown,
		tenantId: string,
		source: WorkflowSource,
	): WorkflowSourceProjection
}

/** Canonicalize the closed safe manifest before constructing any durable payload. */
export function workflowManifestDigest(value: unknown): {
	manifest: DomainApprovalManifest
	digest: string
} {
	const manifest = parseDomainApprovalManifest(value)
	return { manifest, digest: commandHash('WorkflowSourceManifest:1', manifest) }
}
