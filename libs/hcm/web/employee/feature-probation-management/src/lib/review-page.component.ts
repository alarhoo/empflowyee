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
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { Timeline } from '@fundamental-ngx/ui5-webcomponents-fiori/timeline'
import { TimelineItem } from '@fundamental-ngx/ui5-webcomponents-fiori/timeline-item'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import { HcmDatePipe } from '@empflowyee/hcm-web-runtime-context'
import {
	ProbationManagementApi,
	employeeDenied,
	employeeMissing,
	probationErrorMessage,
} from '@empflowyee/hcm-web-employee-data-access'
import type { ProbationReviewDto } from '@empflowyee/hcm-employee-contract'
import {
	OUTCOME_LABELS,
	REVIEW_TYPE_LABELS,
	outcomeStatus,
	probationStatus,
	reviewState,
} from './labels'
import type { ProbationDialogInput } from './probation-dialog.component'

interface HistoryEntry {
	title: string
	at: string
	detail: string
}

/** Mid column: one review with Overview, Reviews, Assessments, Decision and History. */
@Component({
	selector: 'ef-hcm-probation-case-review',
	imports: [
		ObjectStatusComponent,
		Form,
		FormItem,
		Label,
		Text,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		Timeline,
		TimelineItem,
		HcmObjectPage,
		HcmObjectSection,
		HcmDatePipe,
	],
	templateUrl: './review-page.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewPageComponent {
	readonly reviewId = input.required<string>()
	readonly refresh = input(0)
	readonly dialogRequested = output<ProbationDialogInput>()
	readonly opened = output<string>()
	readonly closed = output<void>()
	private readonly api = inject(ProbationManagementApi)
	private readonly destroy = inject(DestroyRef)
	private load$?: Subscription
	readonly state = reviewState
	readonly probation = probationStatus
	readonly outcome = outcomeStatus
	readonly types = REVIEW_TYPE_LABELS
	readonly outcomes = OUTCOME_LABELS
	readonly review = signal<ProbationReviewDto | null>(null)
	readonly pageState = signal<'content' | 'loading' | 'error' | 'denied'>('loading')
	readonly message = signal('')
	readonly history = computed(
		/** Lifecycle moments of every review of the employment, newest first. */ () => {
			const r = this.review()
			if (!r) return []
			const entries: HistoryEntry[] = []
			for (const item of r.history) {
				const type = this.types[item.reviewType]
				if (item.decision)
					entries.push({
						title: `${type} decided: ${this.outcomes[item.decision.outcome]}`,
						at: item.decision.decidedAt,
						detail: `${item.decision.decidedBy}: ${item.decision.reason}`,
					})
			}
			for (const assessment of r.assessments)
				entries.push({
					title: `Assessment ${assessment.versionNumber} submitted${assessment.current ? '' : ' (superseded)'}`,
					at: assessment.submittedAt,
					detail: `${assessment.reviewer.name}: ${this.outcomes[assessment.recommendation]}, rated ${assessment.overallRating} of 5`,
				})
			return entries.sort(/** Newest first. */ (a, b) => b.at.localeCompare(a.at))
		},
	)
	readonly actions = computed(
		/** Commands the server says the viewer may use. */ () => {
			const r = this.review()
			const actions: { id: string; label: string; mutates?: boolean; emphasized?: boolean }[] = []
			if (r?.actions.decide)
				actions.push({ id: 'decision', label: 'Record decision', mutates: true, emphasized: true })
			if (r?.actions.assignReviewer)
				actions.push({
					id: 'reviewer',
					label: r.reviewer ? 'Change reviewer' : 'Assign reviewer',
					mutates: true,
				})
			if (r?.actions.cancel) actions.push({ id: 'cancel', label: 'Cancel review', mutates: true })
			actions.push({ id: 'close', label: 'Close' })
			return actions
		},
	)

	/** Reload when the review or a refresh changes. */
	constructor() {
		effect(
			/** Track the inputs that define the visible data. */ () => {
				this.reviewId()
				this.refresh()
				untracked(/** Load outside the reactive context. */ () => this.load())
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.load$?.unsubscribe())
	}

	/** Load the review. */
	load(): void {
		this.load$?.unsubscribe()
		if (this.review()?.id !== this.reviewId()) this.pageState.set('loading')
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
							? 'This review is no longer available.'
							: probationErrorMessage(error),
					)
					this.pageState.set(employeeDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Route Object Page actions. */
	action(id: string): void {
		const review = this.review()
		if (id === 'close') this.closed.emit()
		else if (review && (id === 'decision' || id === 'reviewer' || id === 'cancel'))
			this.dialogRequested.emit({ mode: id, review })
	}
}
