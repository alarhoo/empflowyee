export type HcmRole =
	'employee' | 'manager' | 'hr-operations' | 'analyst' | 'tenant-admin' | 'tenant-super-admin'

/** Fixture choices only; the future authenticated bootstrap owns effective roles. */
export const HCM_ROLES: readonly HcmRole[] = [
	'employee',
	'manager',
	'hr-operations',
	'analyst',
	'tenant-admin',
	'tenant-super-admin',
]

export type HcmEntitlement =
	| 'employee-core'
	| 'organisation'
	| 'leave'
	| 'time'
	| 'expenses'
	| 'notifications'
	| 'analytics'
	| 'administration'

export const HCM_ENTITLEMENTS: readonly HcmEntitlement[] = [
	'employee-core',
	'organisation',
	'leave',
	'time',
	'expenses',
	'notifications',
	'analytics',
	'administration',
]

export type HcmThemeVariant = 'horizon-light' | 'horizon-dark' | 'her-light' | 'her-dark'

export interface HcmTenantContext {
	tenantId: string
	slug: string
	displayName: string
	logoUrl?: string
	defaultTheme: HcmThemeVariant
	primaryColor?: string
	defaultLocale: string
	defaultTimezone: string
	defaultDateFormat: string
	defaultTimeFormat: '12h' | '24h'
	defaultNumberFormat: string
}

export interface HcmPrincipalContext {
	userId: string
	employeeId: string
	displayName: string
	email: string
	roles: readonly HcmRole[]
	entitlements: readonly HcmEntitlement[]
}

export interface HcmUserPreferences {
	theme?: HcmThemeVariant
	locale?: string
	timezone?: string
	dateFormat?: string
	timeFormat?: '12h' | '24h'
	numberFormat?: string
}

export interface HcmRuntimeContext {
	tenant: HcmTenantContext
	principal: HcmPrincipalContext
	preferences: HcmUserPreferences
}
