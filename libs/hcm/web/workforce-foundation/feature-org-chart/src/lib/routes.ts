import type { Routes } from '@angular/router'
import { OrgChartComponent } from './org-chart.component'

/** One shell owns both columns; the child segment only names the selected assignment. */
export const ORG_CHART_ROUTES: Routes = [
	{
		path: '',
		component: OrgChartComponent,
		children: [
			{ path: '', children: [] },
			{ path: ':assignmentId', children: [] },
		],
	},
]
