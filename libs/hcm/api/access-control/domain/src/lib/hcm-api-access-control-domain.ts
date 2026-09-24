import { RoleError, type RoleDetail } from '@empflowyee/hcm-access-control-contract'
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
