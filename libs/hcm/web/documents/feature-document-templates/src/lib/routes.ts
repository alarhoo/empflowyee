import type { Routes } from '@angular/router'
import { DocumentTemplatesComponent } from './document-templates.component'
export const DOCUMENT_TEMPLATES_ROUTES: Routes = [
	{
		path: '',
		component: DocumentTemplatesComponent,
		canDeactivate: [
			/** Preserve unsaved file uploads during navigation or persona change. */ (
				component: DocumentTemplatesComponent,
			) => component.canLeave(),
		],
	},
]
