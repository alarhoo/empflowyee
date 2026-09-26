import type { WorkforceActor } from '@empflowyee/hcm-api-workforce-foundation-application'
import type { ProfileFieldVisibilityPort } from './profile-visibility-port'
import type { TeamScopeResolver } from './team-scope'

/** Employee ports bound to one transaction. */
export interface EmployeePorts {
	visibility: ProfileFieldVisibilityPort
	team: TeamScopeResolver
}

/**
 * Bind the employee ports to a caller's open, authorized transaction. The transaction handle is
 * opaque to application code; infrastructure supplies the implementation.
 */
export abstract class EmployeePortBinder {
	/** Return ports that run inside the given transaction as the given actor. */
	abstract bind(transaction: unknown, actor: WorkforceActor): EmployeePorts
}
