import type { CanDeactivateFn, Routes } from '@angular/router'
import { WorkSchedules } from './schedules.component'
import { WorkScheduleEditor } from './editor.component'
import { AttendancePolicyEditor } from './policy-editor.component'
import { WorkShiftEditor } from './shift-editor.component'

/** Preserve dirty drafts and unresolved writes when leaving either native workspace. */
const canLeave: CanDeactivateFn<
	WorkSchedules | WorkScheduleEditor | AttendancePolicyEditor | WorkShiftEditor
> = /** Delegate the decision to the active owning form. */ (component) =>
	component?.canLeave() ?? true

export const WORK_SCHEDULES_ROUTES: Routes = [
	{ path: 'shift/new', component: WorkShiftEditor, canDeactivate: [canLeave] },
	{ path: ':id/shift-edit', component: WorkShiftEditor, canDeactivate: [canLeave] },
	{ path: 'policy/new', component: AttendancePolicyEditor, canDeactivate: [canLeave] },
	{ path: ':id/policy-edit', component: AttendancePolicyEditor, canDeactivate: [canLeave] },
	{ path: 'new', component: WorkScheduleEditor, canDeactivate: [canLeave] },
	{ path: ':id/edit', component: WorkScheduleEditor, canDeactivate: [canLeave] },
	{
		path: '',
		component: WorkSchedules,
		canDeactivate: [canLeave],
		children: [{ path: ':id', children: [] }],
	},
]
