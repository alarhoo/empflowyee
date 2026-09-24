import type { Routes } from '@angular/router'
import { NotificationTemplatesComponent } from './notification-templates.component'
export const NOTIFICATION_TEMPLATES_ROUTES: Routes = [
	{
		path: '',
		component: NotificationTemplatesComponent,
		canDeactivate: [
			/** Protect focused configuration drafts during route or persona replacement. */ (
				component: NotificationTemplatesComponent,
			) => component.canLeave(),
		],
	},
]
