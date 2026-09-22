import { inject } from '@angular/core'
import type { Routes } from '@angular/router'
import { RUNTIME_CONFIG } from '@empflowyee/platform-web-runtime-shell'
import { isThemeLabEnabled } from '@empflowyee/hcm-web-runtime-context'

export const appRoutes: Routes = [
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
		path: '',
		pathMatch: 'full',
		loadComponent: /** Keep ordinary HCM shell composition independent of the lab. */ () =>
			import('@empflowyee/hcm-web-shell').then(/** Select the shell. */ (m) => m.HcmShellComponent),
	},
	{ path: '**', redirectTo: '' },
]
