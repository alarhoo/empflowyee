import type { Routes } from '@angular/router'
import { MyHrRequestsComponent } from './my-hr-requests.component'

/** Consult an open draft before leaving. */
function canLeave(component: { canLeave(): Promise<boolean> }): Promise<boolean> {
	return component.canLeave()
}

/** One shell owns the list and request columns; the child segment names the selected request. */
export const MY_HR_REQUESTS_ROUTES: Routes = [
	{
		path: '',
		component: MyHrRequestsComponent,
		canDeactivate: [canLeave],
		children: [
			{ path: '', children: [] },
			{ path: ':requestId', children: [] },
		],
	},
]
