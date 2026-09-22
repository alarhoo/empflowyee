import type { Routes } from '@angular/router'

export const appRoutes: Routes = [
	{
		path: '',
		loadComponent: /** Lazily resolve the shell composition component. */ () =>
			import('@empflowyee/hcm-web-shell').then(
				/** Select the shell export from its public library. */ (m) => m.HcmShellComponent,
			),
		children: [
			{
				path: 'ux/theme-lab',
				loadChildren: /** Load the Theme Lab route configuration only on navigation. */ () =>
					import('@empflowyee/hcm-web-ux-feature-theme-lab').then(
						/** Select the feature-owned route array. */ (m) => m.THEME_LAB_ROUTES,
					),
			},
			{ path: '', pathMatch: 'full', redirectTo: 'ux/theme-lab' },
		],
	},
]
