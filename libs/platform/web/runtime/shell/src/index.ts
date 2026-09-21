import { ApplicationConfig, ApplicationRef, InjectionToken, Type } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { BrowserRuntimeConfig } from '@empflowyee/platform-runtime-contract'
import { loadRuntimeConfig } from './loader'

export const RUNTIME_CONFIG = new InjectionToken<Readonly<BrowserRuntimeConfig>>(
	'Runtime configuration',
)
export { loadRuntimeConfig } from './loader'

/** Bootstrap only after validated configuration is injectable; display a safe error screen on failure. */
export async function bootstrapWithRuntimeConfig(
	root: Type<unknown>,
	config: ApplicationConfig,
): Promise<ApplicationRef | undefined> {
	try {
		const runtimeConfig = await loadRuntimeConfig()
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
