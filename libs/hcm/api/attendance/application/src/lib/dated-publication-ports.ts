import type { AppendAudit } from '@empflowyee/hcm-api-audit-application'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import type {
	DatedConfigurationFamily,
	DatedConfigurationPreviewCommand,
	DatedConfigurationPreviewView,
} from '@empflowyee/hcm-attendance-contract'
import type { AttendanceCommandReceiptStore } from './configuration-evidence'
import type { DatedConfigurationVersion } from './dated-impact'

export interface DatedConfigurationPublicationPort {
	/** Persist the exact source and employment context and enqueue a real worker review. */
	start(
		source: DatedConfigurationVersion,
		input: DatedConfigurationPreviewCommand,
	): Promise<DatedConfigurationPreviewView>
	/** Read only the current actor's source-specific preview. */
	read(source: DatedConfigurationVersion, previewId: string): Promise<DatedConfigurationPreviewView>
	/** Revalidate current dated inputs and consume the exact Ready evidence atomically. */
	consume(source: DatedConfigurationVersion, previewId: string, digest: string): Promise<void>
}
export interface DatedPublicationWork {
	publication: DatedConfigurationPublicationPort
	configurations: {
		/** Read the selected exact version without substituting the latest root version. */
		read(id: string, version: string): Promise<DatedConfigurationVersion | null>
		/** Lock the exact source before mutation or source revision checks. */
		lock(id: string, version: string): Promise<DatedConfigurationVersion | null>
		/** Freeze the current source after the review has been consumed in this transaction. */
		publish(id: string, version: string, revision: number, digest: string): Promise<void>
		/** Retire without changing published content or historical workdays. */
		retire(id: string, version: string, revision: number): Promise<void>
	}
	receipts: AttendanceCommandReceiptStore
	audit: AppendAudit
	/** Recheck source read authority before recovering a private response receipt. */
	requireRead(): Promise<void>
}
export abstract class AttendanceDatedPublicationUnit {
	/** Bind one source family's lifecycle operation to current authority and a stable tenant transaction. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		family: DatedConfigurationFamily,
		operation: 'read' | 'preview' | 'publish' | 'retire',
		write: boolean,
		work: (scope: DatedPublicationWork) => Promise<T>,
	): Promise<T>
}
