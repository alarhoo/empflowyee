import type { Routes } from '@angular/router'
import { EmployeeDocumentsComponent } from './employee-documents.component'
import { WorkerUploadComponent } from './worker-upload.component'
export const EMPLOYEE_DOCUMENTS_ROUTES: Routes = [
	{
		path: 'create',
		component: WorkerUploadComponent,
		canDeactivate: [
			/** Preserve complex create drafts and pending uploads. */ (
				component: WorkerUploadComponent,
			) => component.canLeave(),
		],
	},
	{
		path: '',
		component: EmployeeDocumentsComponent,
		canDeactivate: [
			/** Preserve focused version and sharing drafts. */ (component: EmployeeDocumentsComponent) =>
				component.canLeave(),
		],
	},
]
