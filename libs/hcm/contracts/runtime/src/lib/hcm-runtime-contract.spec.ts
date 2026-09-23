import { expect, it } from 'vitest'
import { resolveHcmPreferences, type TenantPresentation } from './hcm-runtime-contract'
import { parseHcmRuntimeContext, parseHcmTenantDiscovery } from './validation'

it('resolves theme and every presentation preference independently', /** Cover user, tenant and platform precedence including policy-disabled user themes. */ () => {
	const tenant: TenantPresentation = {
		slug: 'test',
		displayName: 'Test',
		status: 'active',
		allowUserTheme: true,
		defaults: {
			theme: 'her-light',
			language: 'de',
			locale: 'de-DE',
			timezone: 'Europe/Berlin',
			dateFormat: 'short',
			timeFormat: '12h',
			numberFormat: 'decimal',
			density: 'cozy',
		},
	}
	expect(resolveHcmPreferences().theme).toBe('horizon-light')
	expect(resolveHcmPreferences(tenant)).toEqual(tenant.defaults)
	const user = {
		theme: 'horizon-dark',
		language: 'en',
		locale: 'en-GB',
		timezone: 'Europe/London',
		dateFormat: 'long',
		timeFormat: '24h',
		numberFormat: 'compact',
		density: 'compact',
	} as const
	expect(resolveHcmPreferences(tenant, user)).toEqual(user)
	expect(resolveHcmPreferences({ ...tenant, allowUserTheme: false }, user).theme).toBe('her-light')
	expect(resolveHcmPreferences(tenant, { theme: undefined }).theme).toBe('her-light')
})

it('rejects malformed runtime payloads before a shell can enter ready and freezes valid data', /** Runtime JSON must satisfy nested access, tenant and preference contracts rather than only compile-time types. */ () => {
	const discovery = {
		tenant: {
			slug: 'test',
			displayName: 'Test',
			status: 'active',
			allowUserTheme: true,
			defaults: {},
		},
		authentication: { strategies: [] },
	}
	const context = {
		tenant: discovery.tenant,
		user: { id: 'test', displayName: 'Test' },
		access: { roles: [], permissions: [], entitlements: [], featureFlags: [] },
		preferences: {},
		session: { version: 'v1' },
	}
	expect(
		/** Reject malformed capabilities from an otherwise successful HTTP response. */ () =>
			parseHcmRuntimeContext({ ...context, access: { ...context.access, permissions: 'admin' } }),
	).toThrow()
	expect(
		/** Reject an external login redirect instead of handing off credentials to it. */ () =>
			parseHcmTenantDiscovery({
				...discovery,
				authentication: { strategies: [], loginPath: 'https://untrusted.test' },
			}),
	).toThrow()
	expect(
		/** Reject a timezone that native formatters cannot interpret. */ () =>
			parseHcmRuntimeContext({ ...context, preferences: { timezone: 'invalid-zone' } }),
	).toThrow()
	expect(Object.isFrozen(parseHcmTenantDiscovery(discovery).tenant.defaults)).toBe(true)
	expect(Object.isFrozen(parseHcmRuntimeContext(context).access.permissions)).toBe(true)
})
