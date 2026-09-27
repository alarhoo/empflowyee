import type { Routes } from '@angular/router'
import { PositionsComponent } from './positions.component'
import { PositionEditorComponent } from './position-editor.component'

/** Consult an open draft before leaving. */
function canLeave(component: { canLeave(): Promise<boolean> }): Promise<boolean> {
	return component.canLeave()
}

/**
 * One shell owns the three columns; child segments name the selected position and change request.
 * New positions, changes and draft requests are edited on their own routes.
 */
export const POSITIONS_ROUTES: Routes = [
	{ path: 'new', component: PositionEditorComponent, canDeactivate: [canLeave] },
	{
		path: 'requests/:requestId/edit',
		component: PositionEditorComponent,
		canDeactivate: [canLeave],
	},
	{ path: ':positionId/change', component: PositionEditorComponent, canDeactivate: [canLeave] },
	{
		path: '',
		component: PositionsComponent,
		canDeactivate: [canLeave],
		children: [
			{ path: '', children: [] },
			{ path: ':positionId', children: [] },
			{ path: ':positionId/requests/:requestId', children: [] },
		],
	},
]
