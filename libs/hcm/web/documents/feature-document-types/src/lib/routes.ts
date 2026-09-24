import type { Routes } from '@angular/router'
import { DocumentTypesComponent } from './document-types.component'
export const DOCUMENT_TYPES_ROUTES: Routes = [
	{
		path: '',
		component: DocumentTypesComponent,
		canDeactivate: [
			/** Preserve unsaved classification actions during navigation or persona change. */ (
				component: DocumentTypesComponent,
			) => component.canLeave(),
		],
	},
]
