import type { Routes } from '@angular/router'
import { OrganizationStructureComponent } from './organization-structure.component'
import { StructureEditPageComponent } from './structure-edit-page.component'

/** Protect routed complex forms and focused dialogs against accidental draft loss. */
function canLeave(component: { canLeave(): Promise<boolean> }): Promise<boolean> {
	return component.canLeave()
}

export const ORGANIZATION_STRUCTURE_ROUTES: Routes = [
	{ path: ':area/new', component: StructureEditPageComponent, canDeactivate: [canLeave] },
	{ path: ':area/:id/edit', component: StructureEditPageComponent, canDeactivate: [canLeave] },
	{
		path: '',
		component: OrganizationStructureComponent,
		runGuardsAndResolvers: 'paramsOrQueryParamsChange',
		canDeactivate: [canLeave],
	},
]
