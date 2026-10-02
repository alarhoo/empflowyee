import type { CanDeactivateFn, Routes } from '@angular/router'
import { HolidayCalendars } from './calendars.component'
import { HolidayCalendarEditor } from './editor.component'

/** Preserve dirty drafts and unresolved writes when leaving either native workspace. */
const canLeave: CanDeactivateFn<
	HolidayCalendars | HolidayCalendarEditor
> = /** Delegate the decision to the active owning form. */ (component) =>
	component?.canLeave() ?? true

export const HOLIDAY_CALENDARS_ROUTES: Routes = [
	{ path: 'new', component: HolidayCalendarEditor, canDeactivate: [canLeave] },
	{ path: ':id/edit', component: HolidayCalendarEditor, canDeactivate: [canLeave] },
	{
		path: '',
		component: HolidayCalendars,
		canDeactivate: [canLeave],
		children: [{ path: ':id', children: [] }],
	},
]
