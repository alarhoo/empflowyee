import type { Routes } from '@angular/router'
import { MyProfileComponent } from './my-profile.component'

/** Consult an open dialog draft before leaving. */
function canLeave(component: { canLeave(): Promise<boolean> }): Promise<boolean> {
	return component.canLeave()
}

/** A singleton page: the server resolves the worker from the verified account. */
export const MY_PROFILE_ROUTES: Routes = [
	{ path: '', component: MyProfileComponent, canDeactivate: [canLeave] },
]
