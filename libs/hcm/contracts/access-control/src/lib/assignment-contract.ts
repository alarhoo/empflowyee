import type { Page } from './hcm-access-control-contract'

export interface AssignmentRole {
	id: string
	label: string
	grantId: string
}
export interface AssignmentAccount {
	accountId: string
	displayName: string
	email: string
	enabled: boolean
	revision: number
}
export interface AssignmentSummary extends AssignmentAccount {
	roles: Page<AssignmentRole>
}
export interface AssignmentRoleOption {
	id: string
	label: string
	systemRole: boolean
}
export interface AssignmentQuery {
	q: string
	enabled?: boolean
	sort: 'displayName:asc' | 'displayName:desc'
	limit: number
	cursor?: string
}
export interface AssignmentPageQuery {
	limit: number
	cursor?: string
}
export interface AssignmentOptionsQuery extends AssignmentPageQuery {
	q: string
}
export interface AssignmentCommand {
	roleId: string
	expectedRevision: number
	reason: string
	grantId?: string
}
export class AssignmentError extends Error {
	/** Carry only a safe public assignment failure classification. */
	constructor(
		readonly code:
			| 'invalid-request'
			| 'not-found'
			| 'revision-conflict'
			| 'duplicate-grant'
			| 'grant-conflict'
			| 'idempotency-conflict',
	) {
		super(code)
	}
}
/** Accept bounded opaque account identifiers, including persisted slash-delimited seed IDs. */
export function assignmentAccountId(value: string): string {
	if (
		!value ||
		value.length > 200 ||
		[...value].some(
			/** Reject control characters in opaque route identities. */ (character) =>
				character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
		)
	)
		throw new AssignmentError('invalid-request')
	return value
}
/** Normalize exactly the approved grant/revoke payload before receipt hashing or persistence. */
export function parseAssignmentCommand(
	body: unknown,
	operation: 'grant' | 'revoke',
): AssignmentCommand {
	if (!body || typeof body !== 'object' || Array.isArray(body))
		throw new AssignmentError('invalid-request')
	const value = body as Record<string, unknown>
	const keys =
		operation === 'grant'
			? 'expectedRevision,reason,roleId'
			: 'expectedRevision,grantId,reason,roleId'
	if (
		Object.keys(value).sort().join(',') !== keys ||
		typeof value['roleId'] !== 'string' ||
		!/^[A-Za-z0-9_-]{1,64}$/.test(value['roleId']) ||
		!Number.isSafeInteger(value['expectedRevision']) ||
		Number(value['expectedRevision']) < 1 ||
		typeof value['reason'] !== 'string' ||
		!value['reason'].trim() ||
		value['reason'].length > 500 ||
		(operation === 'revoke' &&
			(typeof value['grantId'] !== 'string' ||
				!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
					value['grantId'],
				)))
	)
		throw new AssignmentError('invalid-request')
	return {
		roleId: value['roleId'],
		expectedRevision: Number(value['expectedRevision']),
		reason: value['reason'].trim(),
		...(operation === 'revoke' ? { grantId: value['grantId'] as string } : {}),
	}
}
