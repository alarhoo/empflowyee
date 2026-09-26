import type { Routes } from '@angular/router'
import { TeamDirectoryComponent } from './team-directory.component'

/** One shell owns both columns; the child segment only names the selected member. */
export const TEAM_DIRECTORY_ROUTES: Routes = [
	{
		path: '',
		component: TeamDirectoryComponent,
		children: [
			{ path: '', children: [] },
			{ path: ':workerId', children: [] },
		],
	},
]
