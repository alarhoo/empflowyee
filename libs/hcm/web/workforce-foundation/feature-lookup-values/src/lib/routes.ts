import type { Routes } from '@angular/router'
import { LookupValuesComponent } from './lookup-values.component'

/** Protect open value drafts against accidental loss. */
function canLeave(component: LookupValuesComponent): Promise<boolean> {
	return component.canLeave()
}

/** One shell owns both columns; the child segment only names the selected set. */
export const LOOKUP_VALUES_ROUTES: Routes = [
	{
		path: '',
		component: LookupValuesComponent,
		canDeactivate: [canLeave],
		children: [
			{ path: '', children: [] },
			{ path: ':setKey', children: [] },
		],
	},
]
