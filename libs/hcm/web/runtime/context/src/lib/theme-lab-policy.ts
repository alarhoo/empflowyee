import {
	parseRuntimeMetadata,
	type BrowserRuntimeConfig,
} from '@empflowyee/platform-runtime-contract'

export interface HcmBrowserRuntimeConfig extends BrowserRuntimeConfig {
	hcmThemeLabEnabled?: boolean
	productLinks?: readonly { title: string; url: string }[]
}

/** Enforce the HCM same-origin API path and discard undeclared public configuration fields. */
export function parseHcmBrowserRuntimeConfig(value: unknown): Readonly<HcmBrowserRuntimeConfig> {
	const base = parseRuntimeMetadata(value)
	const { apiBaseUrl, hcmThemeLabEnabled, productLinks } = value as Record<string, unknown>
	if (apiBaseUrl !== '/api') throw new Error('HCM requires the same-origin /api path')
	if (hcmThemeLabEnabled !== undefined && typeof hcmThemeLabEnabled !== 'boolean')
		throw new Error('Invalid HCM Theme Lab flag')
	if (productLinks !== undefined) {
		if (!Array.isArray(productLinks) || productLinks.length > 4)
			throw new Error('Invalid product links')
		for (const item of productLinks) {
			if (
				!item ||
				typeof item.title !== 'string' ||
				!item.title.trim() ||
				typeof item.url !== 'string'
			)
				throw new Error('Invalid product link')
			const url = new URL(item.url)
			if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
				throw new Error('Invalid product URL')
		}
	}
	return Object.freeze({
		...base,
		apiBaseUrl,
		...(productLinks ? { productLinks } : {}),
		...(hcmThemeLabEnabled === undefined ? {} : { hcmThemeLabEnabled }),
	})
}

/** Resolve the public developer-tool flag; it never grants access to protected HCM features. */
export function isThemeLabEnabled(
	config: Pick<HcmBrowserRuntimeConfig, 'environment' | 'hcmThemeLabEnabled'>,
): boolean {
	return config.hcmThemeLabEnabled ?? config.environment !== 'prod'
}

/** Return a presentation hint only; API requests never send this value as tenant authority. */
export function tenantHostnameHint(hostname: string): string | undefined {
	const match = /^([a-z0-9-]+)\.(?:localhost|empflowyee\.com)$/i.exec(hostname)
	return match?.[1].toLowerCase()
}
