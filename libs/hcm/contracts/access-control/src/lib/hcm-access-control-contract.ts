export type PermissionKind = 'catalogue-discovery' | 'business-operation'
export interface PermissionOption {
	code: string
	description: string
	kind: PermissionKind
	entitlement: string
}
export interface RoleSummary {
	id: string
	label: string
	systemRole: boolean
	protectedAdmin: boolean
	revision: number
	permissionCount: number
	assigneeCount: number
}
export interface RoleDetail extends RoleSummary {
	permissionCodes: string[]
}
export interface Page<T> {
	items: T[]
	nextCursor: string | null
}
export interface RoleQuery {
	q: string
	systemRole?: boolean
	sort: 'label:asc' | 'label:desc'
	limit: number
	cursor?: string
}
export interface CreateRole {
	label: string
	permissionCodes: string[]
	reason: string
}
export interface UpdateRole extends CreateRole {
	expectedRevision: number
}
export interface DeleteRole {
	expectedRevision: number
	reason: string
}
export interface DeletedRole {
	id: string
	deleted: true
}
export type RoleCommandResult = RoleDetail | DeletedRole
export class RoleError extends Error {
	/** Carry a safe business classification without retaining submitted values. */
	constructor(
		readonly code:
			| 'invalid-request'
			| 'not-found'
			| 'revision-conflict'
			| 'system-role'
			| 'role-assigned'
			| 'duplicate-label'
			| 'idempotency-conflict',
	) {
		super(code)
	}
}
/** Require exactly the documented body fields before any command is accepted. */
export function parseRoleCommand(
	body: unknown,
	operation: 'create' | 'update' | 'delete',
): CreateRole | UpdateRole | DeleteRole {
	if (!body || typeof body !== 'object' || Array.isArray(body))
		throw new RoleError('invalid-request')
	const value = body as Record<string, unknown>
	const fields = {
		delete: ['expectedRevision', 'reason'],
		create: ['label', 'permissionCodes', 'reason'],
		update: ['expectedRevision', 'label', 'permissionCodes', 'reason'],
	}[operation]
	if (
		Object.keys(value).sort().join(',') !== fields.sort().join(',') ||
		typeof value['reason'] !== 'string' ||
		value['reason'].trim().length < 1 ||
		value['reason'].length > 500
	)
		throw new RoleError('invalid-request')
	const reason = value['reason'].trim()
	if (
		operation !== 'create' &&
		(!Number.isSafeInteger(value['expectedRevision']) || Number(value['expectedRevision']) < 1)
	)
		throw new RoleError('invalid-request')
	if (operation === 'delete') return { reason, expectedRevision: Number(value['expectedRevision']) }
	if (
		typeof value['label'] !== 'string' ||
		value['label'].trim().length < 1 ||
		value['label'].trim().length > 100 ||
		!Array.isArray(value['permissionCodes']) ||
		value['permissionCodes'].length > 1000 ||
		value['permissionCodes'].some(
			/** Bound each code before registry lookup. */ (code) =>
				typeof code !== 'string' || !/^hcm\.[A-Za-z0-9._-]{1,150}$/.test(code),
		) ||
		new Set(value['permissionCodes']).size !== value['permissionCodes'].length
	)
		throw new RoleError('invalid-request')
	const base = {
		label: value['label'].trim(),
		permissionCodes: [...value['permissionCodes']].sort() as string[],
		reason,
	}
	return operation === 'create'
		? base
		: { ...base, expectedRevision: Number(value['expectedRevision']) }
}
