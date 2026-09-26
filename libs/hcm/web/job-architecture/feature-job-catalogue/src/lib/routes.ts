import type { Routes } from '@angular/router'
import { JobCatalogueComponent } from './job-catalogue.component'
import { ProfileEditorComponent } from './profile-editor.component'

/** Consult an open draft before leaving. */
function canLeave(component: { canLeave(): Promise<boolean> }): Promise<boolean> {
	return component.canLeave()
}

/**
 * One shell owns both columns; child segments name the selected catalogue or profile version.
 * New profiles and profile drafts are edited on their own route.
 */
export const JOB_CATALOGUE_ROUTES: Routes = [
	{ path: 'profiles/new', component: ProfileEditorComponent, canDeactivate: [canLeave] },
	{
		path: 'profiles/:versionId/edit',
		component: ProfileEditorComponent,
		canDeactivate: [canLeave],
	},
	{
		path: '',
		component: JobCatalogueComponent,
		canDeactivate: [canLeave],
		children: [
			{ path: '', children: [] },
			{ path: 'versions/:versionId', children: [] },
			{ path: 'profiles/:versionId', children: [] },
		],
	},
]
