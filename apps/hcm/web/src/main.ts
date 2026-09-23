import './ui5-init'
import { bootstrapApplication } from '@angular/platform-browser'
import { appConfig } from './app/app.config'
import { App } from './app/app'

void bootstrapApplication(App, appConfig).catch(
	/** Show a safe local-configuration failure without exposing configuration values. */ () => {
		const message = document.createElement('main')
		message.setAttribute('role', 'alert')
		message.textContent =
			'Application configuration could not be loaded. Reload the page or contact support.'
		document.body.replaceChildren(message)
	},
)
