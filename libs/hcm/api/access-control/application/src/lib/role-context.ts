import type {
	ContextQuery,
	Page,
	RoleAssignee,
	RoleHistoryItem,
} from '@empflowyee/hcm-access-control-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'

/** Read boundary for role context, with independent assignment and audit authorization. */
export abstract class RoleContext {
	/** Project current assignment occurrences through the assignment-owned read service. */
	abstract assignees(
		context: AuthenticatedHcmContext,
		roleId: string,
		query: ContextQuery,
	): Promise<Page<RoleAssignee>>
	/** Project actual role history through the audit-owned reader. */
	abstract history(
		context: AuthenticatedHcmContext,
		roleId: string,
		query: ContextQuery,
	): Promise<Page<RoleHistoryItem>>
}
