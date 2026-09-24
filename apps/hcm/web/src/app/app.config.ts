import {
	ApplicationConfig,
	provideBrowserGlobalErrorListeners,
	provideZoneChangeDetection,
} from '@angular/core'
import { provideRouter, withInMemoryScrolling } from '@angular/router'
import { appRoutes } from './app.routes'
import { provideHcmUx } from '@empflowyee/hcm-web-ux-theme'
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http'
import { provideRuntimeConfig } from '@empflowyee/platform-web-runtime-shell'
import {
	parseHcmBrowserRuntimeConfig,
	hcmApiInterceptor,
} from '@empflowyee/hcm-web-runtime-context'

export const appConfig: ApplicationConfig = {
	providers: [
		...provideRuntimeConfig(parseHcmBrowserRuntimeConfig),
		provideHttpClient(withFetch(), withInterceptors([hcmApiInterceptor])),
		...provideHcmUx(),
		provideBrowserGlobalErrorListeners(),
		provideZoneChangeDetection({ eventCoalescing: true }),
		provideRouter(appRoutes, withInMemoryScrolling({ anchorScrolling: 'enabled' })),
	],
}
