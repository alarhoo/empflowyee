import type { Routes } from '@angular/router'
import { EmployeeImportComponent } from './employee-import.component'
import { RunWizardComponent } from './run-wizard.component'
import { TemplateEditorComponent } from './template-editor.component'

/** Consult an open draft before leaving. */
function canLeave(component: { canLeave(): Promise<boolean> }): Promise<boolean> {
	return component.canLeave()
}

/**
 * One shell owns both columns; child segments name the selected run or template. New runs use
 * the wizard route, and templates are created and edited on their own route.
 */
export const EMPLOYEE_IMPORT_ROUTES: Routes = [
	{ path: 'runs/new', component: RunWizardComponent, canDeactivate: [canLeave] },
	{ path: 'templates/new', component: TemplateEditorComponent, canDeactivate: [canLeave] },
	{
		path: 'templates/:templateId/edit',
		component: TemplateEditorComponent,
		canDeactivate: [canLeave],
	},
	{
		path: '',
		component: EmployeeImportComponent,
		canDeactivate: [canLeave],
		children: [
			{ path: '', children: [] },
			{ path: 'runs/:runId', children: [] },
			{ path: 'templates/:templateId', children: [] },
		],
	},
]
