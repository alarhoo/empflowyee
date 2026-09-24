import { inject } from '@angular/core'
import type { Routes } from '@angular/router'
import { RUNTIME_CONFIG } from '@empflowyee/platform-web-runtime-shell'
import { hcmRouteAccess, isThemeLabEnabled } from '@empflowyee/hcm-web-runtime-context'

export const appRoutes: Routes = [
	{
		path: 'access-control/role-management',
		data: { catalogId: 'ROLE_MANAGEMENT' },
		canMatch: [hcmRouteAccess],
		canDeactivate: [
			/** Preserve dirty role drafts before navigation or persona replacement. */ (component: {
				canLeave: () => Promise<boolean>
			}) => component.canLeave(),
		],
		loadComponent: /** Lazy-load the domain-owned screen. */ () =>
			import('@empflowyee/hcm-web-access-control-feature-role-management').then(
				/** Select only the admitted role feature. */ (module) => module.RoleManagementComponent,
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
