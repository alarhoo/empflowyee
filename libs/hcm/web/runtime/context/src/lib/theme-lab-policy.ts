import {
	parseBrowserRuntimeConfig,
	type BrowserRuntimeConfig,
} from '@empflowyee/platform-runtime-contract'

export interface HcmBrowserRuntimeConfig extends BrowserRuntimeConfig {
	hcmThemeLabEnabled?: boolean
}

/** Validate the HCM-owned extension while retaining the platform's strict public base contract. */
export function parseHcmBrowserRuntimeConfig(value: unknown): Readonly<HcmBrowserRuntimeConfig> {
	const base = parseBrowserRuntimeConfig(value)
	const { hcmThemeLabEnabled } = value as Record<string, unknown>
	if (hcmThemeLabEnabled !== undefined && typeof hcmThemeLabEnabled !== 'boolean')
		throw new Error('Invalid HCM Theme Lab flag')
	return Object.freeze({
		...base,
		...(hcmThemeLabEnabled === undefined ? {} : { hcmThemeLabEnabled }),
	})
}

/** Resolve the public developer-tool flag; production stays disabled unless explicitly enabled. */
export function isThemeLabEnabled(
	config: Pick<HcmBrowserRuntimeConfig, 'environment' | 'hcmThemeLabEnabled'>,
): boolean {
	return config.hcmThemeLabEnabled ?? config.environment !== 'prod'
}
