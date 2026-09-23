import { expect, it } from 'vitest'
import {
	isThemeLabEnabled,
	parseHcmBrowserRuntimeConfig,
	tenantHostnameHint,
} from './theme-lab-policy'

it('validates the HCM flag without passing arbitrary configuration fields through', /** Accept only the declared boolean extension of the public base contract. */ () => {
	const config = { environment: 'prod', releaseId: 'test', apiBaseUrl: '/api' }
	expect(
		parseHcmBrowserRuntimeConfig({ ...config, hcmThemeLabEnabled: false }).hcmThemeLabEnabled,
	).toBe(false)
	expect(parseHcmBrowserRuntimeConfig(config).hcmThemeLabEnabled).toBeUndefined()
	expect(
		/** Reject ambiguous string coercion. */ () =>
			parseHcmBrowserRuntimeConfig({ ...config, hcmThemeLabEnabled: 'false' }),
	).toThrow('Theme Lab')
	expect(parseHcmBrowserRuntimeConfig({ ...config, secret: 'discard' })).not.toHaveProperty(
		'secret',
	)
})

it('defaults the developer lab off in PROD and honors explicit runtime flags', /** Keep route availability separate from authentication or bundle compilation. */ () => {
	expect(isThemeLabEnabled({ environment: 'prod' })).toBe(false)
	expect(isThemeLabEnabled({ environment: 'dev' })).toBe(true)
	expect(isThemeLabEnabled({ environment: 'local', hcmThemeLabEnabled: false })).toBe(false)
	expect(isThemeLabEnabled({ environment: 'prod', hcmThemeLabEnabled: true })).toBe(true)
})

it('keeps hostname parsing a presentation hint and rejects cross-origin HCM deployment configuration', /** Browser hints cannot configure API tenant authority or redirect runtime requests. */ () => {
	expect(tenantHostnameHint('acme.localhost')).toBe('acme')
	expect(tenantHostnameHint('acme.empflowyee.com')).toBe('acme')
	expect(tenantHostnameHint('acme.evil.test')).toBeUndefined()
	expect(
		/** Try an independently hosted API that would lose same-origin session semantics. */ () =>
			parseHcmBrowserRuntimeConfig({
				environment: 'prod',
				releaseId: 'test',
				apiBaseUrl: 'https://other.test/api',
			}),
	).toThrow('same-origin')
})
