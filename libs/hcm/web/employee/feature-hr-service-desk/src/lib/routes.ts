import type { Routes } from '@angular/router'
import { HrServiceDeskComponent } from './hr-service-desk.component'

/** Consult an open draft before leaving. */
function canLeave(component: { canLeave(): Promise<boolean> }): Promise<boolean> {
	return component.canLeave()
}

/** One shell owns the queue and request columns; the child segment names the selected request. */
export const HR_SERVICE_DESK_ROUTES: Routes = [
	{
		path: '',
		component: HrServiceDeskComponent,
		canDeactivate: [canLeave],
		children: [
			{ path: '', children: [] },
			{ path: ':requestId', children: [] },
		],
	},
]
