import {
	ApplicationConfig,
	provideBrowserGlobalErrorListeners,
	provideZoneChangeDetection,
} from '@angular/core'
import { provideRouter, withInMemoryScrolling } from '@angular/router'
import { appRoutes } from './app.routes'
import { provideHcmUx } from '@empflowyee/hcm-web-ux-theme'

export const appConfig: ApplicationConfig = {
	providers: [
		...provideHcmUx(),
		provideBrowserGlobalErrorListeners(),
		provideZoneChangeDetection({ eventCoalescing: true }),
		provideRouter(appRoutes, withInMemoryScrolling({ anchorScrolling: 'enabled' })),
	],
}
