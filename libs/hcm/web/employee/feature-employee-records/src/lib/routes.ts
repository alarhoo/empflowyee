import type { Routes } from '@angular/router'
import { EmployeeRecordsComponent } from './employee-records.component'
import { NewWorkerComponent } from './new-worker.component'

/** Consult an open draft before leaving. */
function canLeave(component: { canLeave(): Promise<boolean> }): Promise<boolean> {
	return component.canLeave()
}

/**
 * One shell owns the list and record columns; the child segment names the selected worker.
 * New workers are created on the dedicated wizard route.
 */
export const EMPLOYEE_RECORDS_ROUTES: Routes = [
	{ path: 'new', component: NewWorkerComponent, canDeactivate: [canLeave] },
	{
		path: '',
		component: EmployeeRecordsComponent,
		canDeactivate: [canLeave],
		children: [
			{ path: '', children: [] },
			{ path: ':workerId', children: [] },
		],
	},
]
