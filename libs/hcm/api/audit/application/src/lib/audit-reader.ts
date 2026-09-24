import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import type {
	SensitiveAccessQuery,
	SensitiveAccessPage,
	ExportPage,
	ExportQuery,
	AuditPage,
	AuditQuery,
	MyActivityQuery,
	MyActivityPage,
} from '@empflowyee/hcm-audit-contract'
/** Read port for tenant-authorized operational evidence; never an audit mutation API. */
export abstract class AuditReader {
	abstract sensitive(
		context: AuthenticatedHcmContext,
		query: SensitiveAccessQuery,
	): Promise<SensitiveAccessPage>
	abstract exports(context: AuthenticatedHcmContext, query: ExportQuery): Promise<ExportPage>
	abstract activity(
		context: AuthenticatedHcmContext,
		query: MyActivityQuery,
	): Promise<MyActivityPage>
	abstract list(context: AuthenticatedHcmContext, query: AuditQuery): Promise<AuditPage>
}
