import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	effect,
	inject,
	input,
	output,
	signal,
	untracked,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import type { Subscription } from 'rxjs'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { RatingIndicator } from '@fundamental-ngx/ui5-webcomponents/rating-indicator'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import { HcmDatePipe } from '@empflowyee/hcm-web-runtime-context'
import {
	ProbationReviewApi,
	employeeDenied,
	employeeMissing,
	probationErrorMessage,
} from '@empflowyee/hcm-web-employee-data-access'
import type { ReviewerReviewDto } from '@empflowyee/hcm-employee-contract'
import { RECOMMENDATION_LABELS, REVIEW_TYPE_LABELS, reviewState } from './labels'

/** Mid column: one assigned review with Employee, Assessment and History sections. */
@Component({
	selector: 'ef-hcm-reviewer-review',
	imports: [
		ObjectStatusComponent,
		Form,
		FormItem,
		Label,
		Text,
		RatingIndicator,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		HcmObjectPage,
		HcmObjectSection,
		HcmDatePipe,
	],
	templateUrl: './reviewer-review.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewerReviewComponent {
	readonly reviewId = input.required<string>()
	readonly assessed = output<string>()
	readonly closed = output<void>()
	private readonly api = inject(ProbationReviewApi)
	private readonly destroy = inject(DestroyRef)
	private load$?: Subscription
	readonly state = reviewState
	readonly types = REVIEW_TYPE_LABELS
	readonly recommendations = RECOMMENDATION_LABELS
	readonly review = signal<ReviewerReviewDto | null>(null)
	readonly pageState = signal<'content' | 'loading' | 'error' | 'denied'>('loading')
	readonly message = signal('')
	readonly current = computed(
		/** The current assessment, if any. */ () =>
			this.review()?.assessments.find(/** Current. */ (item) => item.current) ?? null,
	)
	readonly actions = computed(
		/** Assessing is allowed until HR decides. */ () => {
			const actions: { id: string; label: string; mutates?: boolean; emphasized?: boolean }[] = []
			if (this.review()?.actions.assess)
				actions.push({
					id: 'assess',
					label: this.current() ? 'Update assessment' : 'Assess',
					mutates: true,
					emphasized: true,
				})
			actions.push({ id: 'close', label: 'Close' })
			return actions
		},
	)

	/** Reload when the review changes. */
	constructor() {
		effect(
			/** Track the review. */ () => {
				this.reviewId()
				untracked(/** Load outside the reactive context. */ () => this.load())
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.load$?.unsubscribe())
	}

	/** Load the review. */
	load(): void {
		this.load$?.unsubscribe()
		this.pageState.set('loading')
		this.message.set('')
		this.load$ = this.api
			.read(this.reviewId())
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the review. */ (review) => {
					this.review.set(review)
					this.pageState.set('content')
				},
				error: /** Truthful failure without stale data. */ (error) => {
					this.review.set(null)
					this.message.set(
						employeeMissing(error)
							? 'This review is no longer assigned to you.'
							: probationErrorMessage(error),
					)
					this.pageState.set(employeeDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Route Object Page actions. */
	action(id: string): void {
		if (id === 'close') this.closed.emit()
		else if (id === 'assess') this.assessed.emit(this.reviewId())
	}
}
