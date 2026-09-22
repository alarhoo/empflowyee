import {
	BrowserRuntimeConfig,
	parseBrowserRuntimeConfig,
} from '@empflowyee/platform-runtime-contract'

/** Fetch fresh public configuration before Angular starts; reject HTTP, timeout and schema failures. */
export async function loadRuntimeConfig(
	fetchConfig: typeof fetch = fetch,
	parseConfig: (value: unknown) => Readonly<BrowserRuntimeConfig> = parseBrowserRuntimeConfig,
): Promise<Readonly<BrowserRuntimeConfig>> {
	const response = await fetchConfig('/assets/config.json', {
		cache: 'no-store',
		credentials: 'same-origin',
		signal: AbortSignal.timeout(10000),
	})
	if (!response.ok) throw new Error('Runtime configuration is unavailable')
	return parseConfig(await response.json())
}
