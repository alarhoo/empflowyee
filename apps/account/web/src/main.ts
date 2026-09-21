import { bootstrapApplication } from '@angular/platform-browser'
import { appConfig } from './app/app.config'
import { App } from './app/app'

bootstrapApplication(App, appConfig).catch(
	/** Report Angular bootstrap failures to the browser console. */ (err) => console.error(err),
)
