import type { Routes } from '@angular/router'
import { IdentityAdministrationComponent } from './identity-administration.component'
export const IDENTITY_ADMINISTRATION_ROUTES: Routes = [
	{
		path: '',
		component: IdentityAdministrationComponent,
		runGuardsAndResolvers: 'paramsOrQueryParamsChange',
		canDeactivate: [
			/** Confirm dirty assignment actions before route or persona changes. */ (
				component: IdentityAdministrationComponent,
			) => component.canLeave(),
		],
	},
]
