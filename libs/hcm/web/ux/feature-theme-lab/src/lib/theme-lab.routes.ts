import type { Routes } from '@angular/router'

export const THEME_LAB_ROUTES: Routes = [
	{
		path: '',
		// This fixture remains reachable while testing roles. It is not an authentication boundary.
		loadComponent: /** Fetch the lab UI only when its child route activates. */ () =>
			import('./theme-lab.component').then(
				/** Resolve the standalone visual lab. */ (m) => m.ThemeLabComponent,
			),
	},
]
