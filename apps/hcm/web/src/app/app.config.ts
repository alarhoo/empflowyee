import {
	ApplicationConfig,
	provideBrowserGlobalErrorListeners,
	provideZoneChangeDetection,
} from '@angular/core'
import { provideRouter, withInMemoryScrolling } from '@angular/router'
import { appRoutes } from './app.routes'
import { provideHcmUx } from '@empflowyee/hcm-web-ux-theme'
import { provideHttpClient } from '@angular/common/http'
import { provideRuntimeConfig } from '@empflowyee/platform-web-runtime-shell'
import { parseHcmBrowserRuntimeConfig } from '@empflowyee/hcm-web-runtime-context'

export const appConfig: ApplicationConfig = {
	providers: [
		...provideRuntimeConfig(parseHcmBrowserRuntimeConfig),
		provideHttpClient(),
		...provideHcmUx(),
		provideBrowserGlobalErrorListeners(),
		provideZoneChangeDetection({ eventCoalescing: true }),
		provideRouter(appRoutes, withInMemoryScrolling({ anchorScrolling: 'enabled' })),
	],
}
