import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	type OnDestroy,
	type OnInit,
	computed,
	inject,
	signal,
} from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { form, FormField, maxLength, pattern, required } from '@angular/forms/signals'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { RatingIndicator } from '@fundamental-ngx/ui5-webcomponents/rating-indicator'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	ProbationReviewApi,
	employeeDenied,
	probationErrorMessage,
} from '@empflowyee/hcm-web-employee-data-access'
import { PROBATION_OUTCOMES, type ReviewerReviewDto } from '@empflowyee/hcm-employee-contract'
import { BASE_ROUTE, RECOMMENDATION_LABELS, REVIEW_PERMISSION } from './labels'

/**
 * Dedicated assessment route: recommendation, a 1-5 rating, strengths, concerns and the reason.
 * A new submission supersedes the current assessment until HR decides; leaving a dirty draft asks
 * first.
 */
@Component({
	selector: 'ef-hcm-assessment-page',
	imports: [
		FormField,
		Bar,
		Button,
		Form,
		FormItem,
		Label,
		Select,
		Option,
		RatingIndicator,
		TextArea,
		Text,
		MessageStrip,
		HcmDynamicPage,
		HcmDiscardDialog,
	],
	templateUrl: './assessment-page.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssessmentPageComponent implements OnInit, OnDestroy {
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(ProbationReviewApi)
	private readonly destroy = inject(DestroyRef)
	private allowLeave = false
	readonly recommendations = PROBATION_OUTCOMES
	readonly labels = RECOMMENDATION_LABELS
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly review = signal<ReviewerReviewDto | null>(null)
	readonly rating = signal(0)
	readonly ratingTouched = signal(false)
	readonly model = signal({
		recommendation: '',
		strengths: '',
		concerns: '',
		recommendationReason: '',
	})
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			required(path.recommendation)
			required(path.recommendationReason)
			pattern(path.recommendationReason, /\S/)
			maxLength(path.recommendationReason, 2000)
			maxLength(path.strengths, 2000)
			maxLength(path.concerns, 2000)
		},
	)
	readonly draft = new HcmDraft(
		/** Track the draft. */ () => ({ ...this.model(), rating: this.rating() }),
	)
	readonly title = computed(
		/** Page title. */ () =>
			this.review() ? `Assess ${this.review()?.context.workerName}` : 'Assess probation',
	)

	/** Load the review and prefill from the current assessment. */
	ngOnInit(): void {
		if (this.runtime.context()?.access.permissions.includes(REVIEW_PERMISSION) !== true) {
			this.state.set('denied')
			return
		}
		this.api
			.read(this.route.snapshot.paramMap.get('reviewId') ?? '')
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Prefill. */ (review) => {
					if (!review.actions.assess) {
						this.message.set('HR has decided this review; its assessment is read-only.')
						this.state.set('error')
						return
					}
					this.review.set(review)
					const current = review.assessments.find(/** Current. */ (item) => item.current)
					if (current) {
						this.model.set({
							recommendation: current.recommendation,
							strengths: current.strengths,
							concerns: current.concerns,
							recommendationReason: current.recommendationReason,
						})
						this.rating.set(current.overallRating)
					}
					this.state.set('content')
					this.draft.markClean()
				},
				error: /** Truthful failure. */ (error) => {
					this.message.set(probationErrorMessage(error))
					this.state.set(employeeDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Keep the chosen whole-star rating. */
	rate(value: number): void {
		this.rating.set(Math.round(value))
		this.ratingTouched.set(true)
	}

	/** Submit the assessment and return to the review. */
	save(): void {
		const review = this.review()
		if (!review || this.draft.saving()) return
		this.fields().markAsTouched()
		this.ratingTouched.set(true)
		for (const field of [
			this.fields.recommendation,
			this.fields.strengths,
			this.fields.concerns,
			this.fields.recommendationReason,
		])
			if (field().invalid()) {
				field().focusBoundControl()
				return
			}
		if (this.rating() < 1) return
		const v = this.model()
		const body = {
			recommendation: v.recommendation,
			overallRating: this.rating(),
			strengths: v.strengths.trim(),
			concerns: v.concerns.trim(),
			recommendationReason: v.recommendationReason.trim(),
			expectedRevision: review.revision,
		}
		this.draft.saving.set(true)
		this.draft.error.set('')
		this.api
			.assess(review.id, body, this.draft.key({ id: review.id, body }))
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Return to the review. */ (saved) => {
					this.draft.saving.set(false)
					this.draft.markClean()
					this.allowLeave = true
					void this.router.navigateByUrl(`${BASE_ROUTE}/${encodeURIComponent(saved.id)}`)
				},
				error: /** Preserve the draft and retry key. */ (error) => {
					this.draft.saving.set(false)
					this.draft.error.set(probationErrorMessage(error))
				},
			})
	}

	/** Leave without submitting. */
	cancel(): void {
		const id = this.route.snapshot.paramMap.get('reviewId') ?? ''
		void this.router.navigateByUrl(`${BASE_ROUTE}/${encodeURIComponent(id)}`)
	}

	/** Allow the route guard to consult this draft. */
	canLeave(): Promise<boolean> {
		return this.allowLeave ? Promise.resolve(true) : this.draft.canLeave()
	}

	/** Release a pending navigation decision. */
	ngOnDestroy(): void {
		this.draft.release()
	}
}
