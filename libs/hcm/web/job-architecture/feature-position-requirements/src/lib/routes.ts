import type { Routes } from '@angular/router'
import { PositionRequirementsComponent } from './position-requirements.component'

/** Consult an open dialog draft before leaving. */
function canLeave(component: { canLeave(): Promise<boolean> }): Promise<boolean> {
	return component.canLeave()
}

/** One shell owns both columns; the child segment names the selected position. */
export const POSITION_REQUIREMENTS_ROUTES: Routes = [
	{
		path: '',
		component: PositionRequirementsComponent,
		canDeactivate: [canLeave],
		children: [
			{ path: '', children: [] },
			{ path: ':positionId', children: [] },
		],
	},
]
