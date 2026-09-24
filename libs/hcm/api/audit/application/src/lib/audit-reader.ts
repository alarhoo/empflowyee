import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import type { AuditPage, AuditQuery } from '@empflowyee/hcm-audit-contract'
/** Read port for tenant-authorized operational evidence; never an audit mutation API. */
export abstract class AuditReader {
	abstract list(context: AuthenticatedHcmContext, query: AuditQuery): Promise<AuditPage>
}
