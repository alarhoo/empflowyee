import type { Routes } from '@angular/router'
import { DocumentRequestsComponent } from './document-requests.component'
import { RequestCreateComponent } from './request-create.component'
export const DOCUMENT_REQUESTS_ROUTES: Routes = [
	{
		path: 'create',
		component: RequestCreateComponent,
		canDeactivate: [
			/** Preserve the complex create draft and pending command. */ (
				component: RequestCreateComponent,
			) => component.canLeave(),
		],
	},
	{
		path: '',
		component: DocumentRequestsComponent,
		canDeactivate: [
			/** Preserve focused submission and lifecycle actions. */ (
				component: DocumentRequestsComponent,
			) => component.canLeave(),
		],
	},
]
