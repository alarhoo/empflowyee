import type { Routes } from '@angular/router'
import { NotificationRulesComponent } from './notification-rules.component'
export const NOTIFICATION_RULES_ROUTES: Routes = [
	{
		path: '',
		component: NotificationRulesComponent,
		canDeactivate: [
			/** Protect focused configuration drafts during route or persona replacement. */ (
				component: NotificationRulesComponent,
			) => component.canLeave(),
		],
	},
]
