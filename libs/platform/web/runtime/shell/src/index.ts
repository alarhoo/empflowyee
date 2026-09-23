import {
	ApplicationConfig,
	ApplicationRef,
	InjectionToken,
	Type,
	provideAppInitializer,
	type Provider,
	type EnvironmentProviders,
} from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { BrowserRuntimeConfig } from '@empflowyee/platform-runtime-contract'
import { loadRuntimeConfig } from './loader'

export const RUNTIME_CONFIG = new InjectionToken<Readonly<BrowserRuntimeConfig>>(
	'Runtime configuration',
)
export { loadRuntimeConfig } from './loader'

/** Initialize local deployment coordinates before dependent services, without fetching remote application state. */
export function provideRuntimeConfig(
	parseConfig?: (value: unknown) => Readonly<BrowserRuntimeConfig>,
): (Provider | EnvironmentProviders)[] {
	let value: Readonly<BrowserRuntimeConfig> | undefined
	return [
		provideAppInitializer(
			/** Load and validate the local public configuration file. */ async () => {
				value = await loadRuntimeConfig(undefined, parseConfig)
			},
		),
		{
			provide: RUNTIME_CONFIG,
			useFactory: /** Reject a consumer that runs before local initialization finishes. */ () => {
				if (!value) throw new Error('Runtime configuration is not initialized')
				return value
			},
		},
	]
}

/** Bootstrap only after validated configuration is injectable; display a safe error screen on failure. */
export async function bootstrapWithRuntimeConfig(
	root: Type<unknown>,
	config: ApplicationConfig,
	parseConfig?: (value: unknown) => Readonly<BrowserRuntimeConfig>,
): Promise<ApplicationRef | undefined> {
	try {
		const runtimeConfig = await loadRuntimeConfig(undefined, parseConfig)
		return await bootstrapApplication(root, {
			...config,
			providers: [...config.providers, { provide: RUNTIME_CONFIG, useValue: runtimeConfig }],
		})
	} catch {
		const message = document.createElement('main')
		message.setAttribute('role', 'alert')
		message.textContent =
			'Application configuration could not be loaded. Please reload the page or contact support.'
		document.body.replaceChildren(message)
		return undefined
	}
}
