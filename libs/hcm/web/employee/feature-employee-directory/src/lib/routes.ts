import type { Routes } from '@angular/router'
import { EmployeeDirectoryComponent } from './employee-directory.component'

/** One shell owns both columns; the child segment only names the selected worker. */
export const EMPLOYEE_DIRECTORY_ROUTES: Routes = [
	{
		path: '',
		component: EmployeeDirectoryComponent,
		children: [
			{ path: '', children: [] },
			{ path: ':workerId', children: [] },
		],
	},
]
