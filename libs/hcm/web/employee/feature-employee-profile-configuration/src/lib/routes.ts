import type { Routes } from '@angular/router'
import { EmployeeProfileConfigurationComponent } from './employee-profile-configuration.component'
import { CustomFieldPageComponent } from './custom-field-page.component'

/** Consult an open draft before leaving. */
function canLeave(component: { canLeave(): Promise<boolean> }): Promise<boolean> {
	return component.canLeave()
}

/** One shell owns both columns; the child segment only names the selected field. */
export const EMPLOYEE_PROFILE_CONFIGURATION_ROUTES: Routes = [
	{ path: 'custom-fields/new', component: CustomFieldPageComponent, canDeactivate: [canLeave] },
	{
		path: '',
		component: EmployeeProfileConfigurationComponent,
		canDeactivate: [canLeave],
		children: [
			{ path: '', children: [] },
			{ path: ':fieldRef', children: [] },
		],
	},
]
