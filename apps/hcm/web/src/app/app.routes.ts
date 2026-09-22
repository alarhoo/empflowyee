import type { Routes } from '@angular/router'

export const appRoutes: Routes = [
	{
		path: '',
		loadComponent: /** Load shell composition independently of feature implementations. */ () =>
			import('@empflowyee/hcm-web-shell').then(
				/** Select the standalone shell. */ (m) => m.HcmShellComponent,
			),
		children: [
			{
				path: 'ux/theme-lab',
				loadChildren: /** Defer the visual lab until its route is visited. */ () =>
					import('@empflowyee/hcm-web-ux-feature-theme-lab').then(
						/** Select feature-owned routes. */ (m) => m.THEME_LAB_ROUTES,
					),
			},
			{ path: '', pathMatch: 'full', redirectTo: 'ux/theme-lab' },
			{ path: '**', redirectTo: 'ux/theme-lab' },
		],
	},
]
