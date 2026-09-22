import type { Routes } from '@angular/router'

export const THEME_LAB_ROUTES: Routes = [
	{
		path: '',
		loadComponent: /** Load the standalone Theme Lab only when its route activates. */ () =>
			import('./theme-lab.component').then(
				/** Select the visual lab component export. */ (m) => m.ThemeLabComponent,
			),
	},
]
