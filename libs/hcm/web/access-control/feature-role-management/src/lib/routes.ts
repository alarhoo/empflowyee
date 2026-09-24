import type { Routes } from '@angular/router'
import { RoleManagementComponent } from './role-management.component'
import { RoleEditPageComponent } from './role-edit-page.component'

/** Protect both routed complex forms and focused action dialogs against accidental draft loss. */
function canLeave(component: { canLeave(): Promise<boolean> }): Promise<boolean> {
	return component.canLeave()
}

export const ROLE_MANAGEMENT_ROUTES: Routes = [
	{ path: 'new', component: RoleEditPageComponent, canDeactivate: [canLeave] },
	{ path: ':id/edit', component: RoleEditPageComponent, canDeactivate: [canLeave] },
	{ path: '', component: RoleManagementComponent, canDeactivate: [canLeave] },
]
