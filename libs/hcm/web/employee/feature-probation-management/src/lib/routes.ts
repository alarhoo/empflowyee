import type { Routes } from '@angular/router'
import { ProbationManagementComponent } from './probation-management.component'

/** Consult an open draft before leaving. */
function canLeave(component: { canLeave(): Promise<boolean> }): Promise<boolean> {
	return component.canLeave()
}

/** One shell owns the case list and review columns; the child segment names the selected review. */
export const PROBATION_MANAGEMENT_ROUTES: Routes = [
	{
		path: '',
		component: ProbationManagementComponent,
		canDeactivate: [canLeave],
		children: [
			{ path: '', children: [] },
			{ path: ':reviewId', children: [] },
		],
	},
]
