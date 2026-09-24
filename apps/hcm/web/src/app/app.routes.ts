import { inject } from '@angular/core'
import type { Routes } from '@angular/router'
import { RUNTIME_CONFIG } from '@empflowyee/platform-web-runtime-shell'
import { hcmRouteAccess, isThemeLabEnabled } from '@empflowyee/hcm-web-runtime-context'

export const appRoutes: Routes = [
	{
		path: 'access-control/access-assignments',
		data: { catalogId: 'ACCESS_ASSIGNMENTS' },
		canMatch: [hcmRouteAccess],
		loadChildren: /** Lazy-load the assignment-owned list/detail and action guards. */ () =>
			import('@empflowyee/hcm-web-access-control-feature-access-assignments').then(
				/** Keep feature routing outside the thin bootstrap root. */ (module) =>
					module.ACCESS_ASSIGNMENTS_ROUTES,
			),
	},

	{
		path: 'access-control/role-management',
		data: { catalogId: 'ROLE_MANAGEMENT' },
		canMatch: [hcmRouteAccess],
		loadChildren: /** Load the domain-owned role routes and draft guards. */ () =>
			import('@empflowyee/hcm-web-access-control-feature-role-management').then(
				/** Keep role detail and complex edit routing inside the feature. */ (module) =>
					module.ROLE_MANAGEMENT_ROUTES,
			),
	},
	{
		path: 'ux/theme-lab',
		canMatch: [
			/** Gate lazy loading with public configuration; this is not authorization. */ () =>
				isThemeLabEnabled(inject(RUNTIME_CONFIG)),
		],
		loadChildren: /** Load the workspace outside the business shell. */ () =>
			import('@empflowyee/hcm-web-ux-feature-theme-lab').then(
				/** Select lazy routes. */ (m) => m.THEME_LAB_ROUTES,
			),
	},
	{
		path: 'workspace',
		data: { catalogId: 'runtime-workspace' },
		canMatch: [hcmRouteAccess],
		loadComponent: /** Load the guarded placeholder feature. */ () =>
			import('@empflowyee/hcm-web-runtime-feature-placeholder').then(
				/** Select the isolated feature component. */ (m) => m.HcmWebRuntimeFeaturePlaceholder,
			),
	},
	{ path: 'access-denied', children: [] },
	{
		path: '',
		pathMatch: 'full',
		data: { fullBleed: true },
		loadComponent: /** Load the catalogue screen independently of global shell chrome. */ () =>
			import('@empflowyee/hcm-web-navigation-feature-launchpad').then(
				/** Select the navigation-owned launchpad. */ (m) => m.HcmLaunchpadComponent,
			),
	},
	{ path: '**', redirectTo: '' },
]
