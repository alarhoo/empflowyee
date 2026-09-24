import { RoleError, type RoleDetail } from '@empflowyee/hcm-access-control-contract'
import { AssignmentError, type AssignmentCommand } from '@empflowyee/hcm-access-control-contract'
/** Validate one assignment occurrence against the shared account revision before writing. */
export function requireAssignmentChange(
	revision: number,
	current: string | null,
	command: AssignmentCommand,
	operation: 'grant' | 'revoke',
): void {
	if (revision !== command.expectedRevision) throw new AssignmentError('revision-conflict')
	if (operation === 'grant' && current) throw new AssignmentError('duplicate-grant')
	if (operation === 'revoke' && (!current || current !== command.grantId))
		throw new AssignmentError('grant-conflict')
}
/** Reject edits to protected/system records and optimistic concurrency conflicts. */
export function requireMutableRole(
	role: RoleDetail,
	expectedRevision: number,
	deleting = false,
): void {
	if (role.systemRole || role.protectedAdmin) throw new RoleError('system-role')
	if (role.revision !== expectedRevision) throw new RoleError('revision-conflict')
	if (deleting && role.assigneeCount > 0) throw new RoleError('role-assigned')
}
