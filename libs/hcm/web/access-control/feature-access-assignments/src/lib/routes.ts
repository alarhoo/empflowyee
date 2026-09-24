import type { Routes } from '@angular/router'
import { AccessAssignmentsComponent } from './access-assignments.component'
export const ACCESS_ASSIGNMENTS_ROUTES: Routes = [
	{
		path: '',
		component: AccessAssignmentsComponent,
		runGuardsAndResolvers: 'paramsOrQueryParamsChange',
		canDeactivate: [
			/** Confirm dirty assignment actions before route or persona changes. */ (
				component: AccessAssignmentsComponent,
			) => component.canLeave(),
		],
	},
]
