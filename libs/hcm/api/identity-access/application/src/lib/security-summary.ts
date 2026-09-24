import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import type {
	SecuritySummary,
	SecurityRoleQuery,
	SecurityRoles,
} from '@empflowyee/hcm-identity-access-contract'

/** Read-only own-account use cases; no caller-selected account or assignment mutations. */
export abstract class SecuritySummaryReader {
	abstract summary(context: AuthenticatedHcmContext): Promise<SecuritySummary>
	abstract roles(context: AuthenticatedHcmContext, query: SecurityRoleQuery): Promise<SecurityRoles>
}
