import type { CanDeactivateFn, Routes } from '@angular/router'
import { WorkScheduleTemplates } from './templates.component'
import { ScheduleTemplateEditor } from './editor.component'

/** Preserve dirty drafts and unresolved writes when leaving either native workspace. */
const canLeave: CanDeactivateFn<
	WorkScheduleTemplates | ScheduleTemplateEditor
> = /** Delegate the decision to the active owning form. */ (component) =>
	component?.canLeave() ?? true

export const WORK_SCHEDULE_TEMPLATES_ROUTES: Routes = [
	{ path: 'new', component: ScheduleTemplateEditor, canDeactivate: [canLeave] },
	{ path: ':id/edit', component: ScheduleTemplateEditor, canDeactivate: [canLeave] },
	{
		path: '',
		component: WorkScheduleTemplates,
		canDeactivate: [canLeave],
		children: [{ path: ':id', children: [] }],
	},
]
