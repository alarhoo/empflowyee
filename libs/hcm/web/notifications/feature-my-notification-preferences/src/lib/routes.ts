import type { Routes } from '@angular/router'
import { NotificationPreferencesComponent } from './notification-preferences.component'
export const NOTIFICATION_PREFERENCES_ROUTES: Routes = [
	{
		path: '',
		component: NotificationPreferencesComponent,
		canDeactivate: [
			/** Confirm unsaved category changes before route or persona replacement. */ (
				component: NotificationPreferencesComponent,
			) => component.canLeave(),
		],
	},
]
