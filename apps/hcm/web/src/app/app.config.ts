import {
	ApplicationConfig,
	provideBrowserGlobalErrorListeners,
	provideZoneChangeDetection,
} from '@angular/core'
import { provideRouter, withInMemoryScrolling } from '@angular/router'
import { appRoutes } from './app.routes'

export const appConfig: ApplicationConfig = {
	providers: [
		provideBrowserGlobalErrorListeners(),
		provideZoneChangeDetection({ eventCoalescing: true }),
		provideRouter(appRoutes, withInMemoryScrolling({ anchorScrolling: 'enabled' })),
	],
}
