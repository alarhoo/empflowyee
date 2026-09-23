import '@ui5/webcomponents-icons/dist/employee.js'
import '@ui5/webcomponents-icons/dist/group.js'
import '@ui5/webcomponents-icons/dist/manager.js'
import '@ui5/webcomponents-icons/dist/pie-chart.js'
import '@ui5/webcomponents-icons/dist/settings.js'
import '@ui5/webcomponents-icons/dist/calendar.js'
import '@ui5/webcomponents-icons/dist/history.js'
import '@ui5/webcomponents-icons/dist/money-bills.js'
import '@ui5/webcomponents-icons/dist/documents.js'
import '@ui5/webcomponents-icons/dist/study-leave.js'
import '@ui5/webcomponents-icons/dist/task.js'
import '@ui5/webcomponents-icons/dist/grid.js'

/** Select maintained UI5 icons for Space navigation without changing catalogue ownership. */
export function hcmSpaceIcon(space: string): string {
	return (
		(
			{
				employee: 'employee',
				manager: 'manager',
				'hr-operations': 'group',
				analytics: 'pie-chart',
				'tenant-administration': 'settings',
			} as Record<string, string>
		)[space] ?? 'grid'
	)
}

/** Give domain-owned applications a consistent visual identity using maintained icon assets. */
export function hcmDomainIcon(domain: string): string {
	return (
		(
			{
				employee: 'employee',
				'workforce-foundation': 'group',
				leave: 'calendar',
				attendance: 'calendar',
				scheduling: 'calendar',
				timesheet: 'history',
				payroll: 'money-bills',
				expenses: 'money-bills',
				'compensation-benefits': 'money-bills',
				documents: 'documents',
				learning: 'study-leave',
				skills: 'study-leave',
				workflow: 'task',
				performance: 'task',
				analytics: 'pie-chart',
				'identity-access': 'settings',
				'access-control': 'settings',
			} as Record<string, string>
		)[domain] ?? 'grid'
	)
}
