export type TenantLifecycleStatus = 'trial' | 'active' | 'grace' | 'suspended' | 'deactivated'
export type HcmThemeVariant = 'horizon-light' | 'horizon-dark' | 'her-light' | 'her-dark'

export interface HcmPreferences {
	language?: string
	locale?: string
	timezone?: string
	dateFormat?: string
	timeFormat?: '12h' | '24h'
	numberFormat?: string
	density?: 'cozy' | 'compact'
	theme?: HcmThemeVariant
}

export interface TenantPresentation {
	slug: string
	displayName: string
	status: TenantLifecycleStatus
	logoUrl?: string
	primaryColor?: string
	defaults: HcmPreferences
	allowUserTheme: boolean
}

export interface TenantDiscoveryResponse {
	tenant: TenantPresentation
	authentication: {
		strategies: readonly string[]
		/** Relative same-origin entry point supplied by the configured authentication adapter. */
		loginPath?: string
	}
}

export interface HcmAccessContext {
	roles: readonly string[]
	permissions: readonly string[]
	entitlements: readonly string[]
	featureFlags: readonly string[]
}

export interface HcmRuntimeContext {
	tenant: TenantPresentation
	user: { id: string; displayName: string; email?: string; employeeId?: string; avatarUrl?: string }
	access: HcmAccessContext
	preferences: HcmPreferences
	session: { version: string; expiresAt?: string }
	/** Server-advertised local tooling only; omitted by production session providers. */
	development?: HcmDevelopmentSession
}

export interface HcmDevelopmentSession {
	personaId: string
	personas: readonly { id: string; displayName: string; roleLabel: string }[]
	catalogueInspection: boolean
}

export type RuntimeFailureCode =
	'tenant-not-found' | 'tenant-suspended' | 'unauthenticated' | 'forbidden' | 'runtime-unavailable'
export interface RuntimeFailure {
	code: RuntimeFailureCode
	requestId: string
}

export const HCM_PLATFORM_PREFERENCES: Readonly<Required<HcmPreferences>> = Object.freeze({
	theme: 'horizon-light',
	language: 'en',
	locale: 'en-US',
	timezone: 'UTC',
	dateFormat: 'medium',
	timeFormat: '24h',
	numberFormat: 'decimal',
	density: 'compact',
})

/** Resolve each presentation preference independently; absent values never erase a fallback. */
export function resolveHcmPreferences(
	tenant?: TenantPresentation,
	user: HcmPreferences = {},
): Readonly<Required<HcmPreferences>> {
	const resolved = { ...HCM_PLATFORM_PREFERENCES }
	for (const source of [tenant?.defaults ?? {}, user]) {
		for (const key of Object.keys(resolved) as (keyof HcmPreferences)[]) {
			const value = source[key]
			if (value !== undefined) Object.assign(resolved, { [key]: value })
		}
	}
	if (tenant && !tenant.allowUserTheme)
		resolved.theme = tenant.defaults.theme ?? HCM_PLATFORM_PREFERENCES.theme
	return Object.freeze(resolved)
}

/** Evaluate only lifecycle access; commercial transition rules remain outside HCM. */
export function isTenantAccessible(tenant: TenantPresentation): boolean {
	return ['trial', 'active', 'grace'].includes(tenant.status)
}
