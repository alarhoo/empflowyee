import type { Routes } from '@angular/router'
import { ProbationReviewComponent } from './probation-review.component'
import { AssessmentPageComponent } from './assessment-page.component'

/** Consult an open draft before leaving. */
function canLeave(component: { canLeave(): Promise<boolean> }): Promise<boolean> {
	return component.canLeave()
}

/** One shell owns the list and review columns; the assessment has its own route. */
export const PROBATION_REVIEW_ROUTES: Routes = [
	{ path: ':reviewId/assessment', component: AssessmentPageComponent, canDeactivate: [canLeave] },
	{
		path: '',
		component: ProbationReviewComponent,
		children: [
			{ path: '', children: [] },
			{ path: ':reviewId', children: [] },
		],
	},
]
