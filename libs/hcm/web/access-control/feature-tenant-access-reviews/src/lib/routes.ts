import type { Routes } from '@angular/router'
import { TenantAccessReviewsComponent } from './tenant-access-reviews.component'
export const TENANT_ACCESS_REVIEWS_ROUTES: Routes = [
	{
		path: '',
		component: TenantAccessReviewsComponent,
		runGuardsAndResolvers: 'paramsOrQueryParamsChange',
		canDeactivate: [
			/** Confirm dirty review actions before route or persona changes. */ (
				component: TenantAccessReviewsComponent,
			) => component.canLeave(),
		],
	},
]
