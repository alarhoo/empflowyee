import type { IdentityPage } from './hcm-identity-access-contract'

export interface SecuritySummary {
	accountId: string
	displayName: string
	email: string
	enabled: boolean
	sessionMode: 'local-development'
	expiresAt: string
}
export interface SecurityRole {
	id: string
	label: string
}
export interface SecurityRoleQuery {
	q: string
	limit: number
	cursor?: string
}
export type SecurityRoles = IdentityPage<SecurityRole>
