import type { Routes } from '@angular/router'
import { EmploymentChangesComponent } from './employment-changes.component'
import { ChangeWizardComponent } from './change-wizard.component'

/** Consult an open draft before leaving. */
function canLeave(component: { canLeave(): Promise<boolean> }): Promise<boolean> {
	return component.canLeave()
}

/**
 * One shell owns the list and request columns; the child segment names the selected request.
 * New requests and draft edits run on the dedicated wizard routes.
 */
export const EMPLOYMENT_CHANGES_ROUTES: Routes = [
	{ path: 'new', component: ChangeWizardComponent, canDeactivate: [canLeave] },
	{ path: ':requestId/edit', component: ChangeWizardComponent, canDeactivate: [canLeave] },
	{
		path: '',
		component: EmploymentChangesComponent,
		canDeactivate: [canLeave],
		children: [
			{ path: '', children: [] },
			{ path: ':requestId', children: [] },
		],
	},
]
