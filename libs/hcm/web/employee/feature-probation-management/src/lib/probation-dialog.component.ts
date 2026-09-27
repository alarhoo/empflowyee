import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	type OnDestroy,
	type OnInit,
	computed,
	inject,
	input,
	output,
	signal,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import type { Observable } from 'rxjs'
import { form, FormField, maxLength, pattern, required } from '@angular/forms/signals'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { DatePicker } from '@fundamental-ngx/ui5-webcomponents/date-picker'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { HcmDatePipe } from '@empflowyee/hcm-web-runtime-context'
import {
	ProbationManagementApi,
	probationErrorMessage,
} from '@empflowyee/hcm-web-employee-data-access'
import {
	PROBATION_OUTCOMES,
	REVIEW_TYPES,
	type ProbationReviewDto,
} from '@empflowyee/hcm-employee-contract'
import { OUTCOME_LABELS, REVIEW_TYPE_LABELS, isoToday } from './labels'
import { ProbationOptionBox, type OptionRef } from './option-box.component'

/** Scheduling a review, optionally for a known employment. */
export interface ScheduleInput {
	mode: 'schedule'
	employment: OptionRef | null
	hireDate?: string
	probationEndDate?: string | null
}

/** A command on an existing review. */
export interface ReviewCommandInput {
	mode: 'reviewer' | 'cancel' | 'decision'
	review: ProbationReviewDto
}

/** One probation command, opened from the list or a review's Object Page. */
export type ProbationDialogInput = ScheduleInput | ReviewCommandInput

/** Focused Dialog to schedule, reassign, cancel or decide a probation review. */
@Component({
	selector: 'ef-hcm-probation-dialog',
	imports: [
		FormField,
		Dialog,
		Bar,
		Button,
		Form,
		FormItem,
		Label,
		Select,
		Option,
		DatePicker,
		Input,
		TextArea,
		Text,
		MessageStrip,
		HcmDiscardDialog,
		HcmDatePipe,
		ProbationOptionBox,
	],
	templateUrl: './probation-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProbationDialog implements OnInit, OnDestroy {
	readonly input = input.required<ProbationDialogInput>()
	readonly saved = output<{ message: string; review: ProbationReviewDto }>()
	readonly closed = output<void>()
	private readonly api = inject(ProbationManagementApi)
	private readonly destroy = inject(DestroyRef)
	private allowClose = false
	readonly reviewTypes = REVIEW_TYPES
	readonly typeLabels = REVIEW_TYPE_LABELS
	/** Outcomes that fit the review; Extend is offered only while an extension is allowed. */
	readonly outcomes = computed(
		/** Allowed outcomes. */ () =>
			PROBATION_OUTCOMES.filter(
				/** Allowed. */ (outcome) => outcome !== 'Extend' || !!this.review()?.maxExtendedEndDate,
			),
	)
	readonly outcomeLabels = OUTCOME_LABELS
	readonly touched = signal(false)
	readonly employment = signal<OptionRef | null>(null)
	readonly reviewer = signal<OptionRef | null>(null)
	readonly model = signal({
		reviewType: 'AdHoc',
		periodStart: '',
		periodEnd: isoToday(),
		dueDate: isoToday(),
		outcome: '',
		effectiveDate: isoToday(),
		extendedProbationEndDate: '',
		evidenceReference: '',
		reason: '',
	})
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			required(path.reason)
			pattern(path.reason, /\S/)
			maxLength(path.reason, 1000)
			maxLength(path.evidenceReference, 200)
			required(path.outcome, { when: /** Decision only. */ () => this.mode() === 'decision' })
			required(path.effectiveDate, { when: /** Decision only. */ () => this.mode() === 'decision' })
			required(path.extendedProbationEndDate, {
				when: /** Extend only. */ () =>
					this.mode() === 'decision' && this.model().outcome === 'Extend',
			})
			required(path.periodStart, { when: /** Schedule only. */ () => this.mode() === 'schedule' })
			required(path.periodEnd, { when: /** Schedule only. */ () => this.mode() === 'schedule' })
			required(path.dueDate, { when: /** Schedule only. */ () => this.mode() === 'schedule' })
		},
	)
	readonly draft = new HcmDraft(
		/** Track the draft. */ () => ({
			model: this.model(),
			employment: this.employment(),
			reviewer: this.reviewer(),
		}),
	)
	readonly mode = computed(/** The command. */ () => this.input().mode)
	readonly review = computed(
		/** The review the command acts on, if any. */ () => {
			const value = this.input()
			return 'review' in value ? value.review : null
		},
	)
	readonly copy = computed(
		/** Title, confirmation and explanation. */ () => {
			const name = this.review()?.workerName ?? ''
			const copies = {
				schedule: {
					title: 'Schedule review',
					confirm: 'Schedule',
					text: 'The review is due on its date; an undecided review shows Overdue after it and Escalated 7 days later.',
				},
				reviewer: {
					title: `Assign reviewer for ${name}`,
					confirm: 'Assign',
					text: 'The stored reviewer is the only person who can assess this review; the previous reviewer loses access at once.',
				},
				cancel: {
					title: `Cancel review of ${name}`,
					confirm: 'Cancel review',
					text: 'A cancelled review changes no employment fact.',
				},
				decision: {
					title: `Decide probation of ${name}`,
					confirm: 'Record decision',
					text: 'Confirm confirms the probation; Extend moves its end date once, by at most 90 days, and schedules the next Final review; Fail never ends employment.',
				},
			}
			return copies[this.mode()]
		},
	)

	/** Prefill from the review or the chosen employment. */
	ngOnInit(): void {
		const value = this.input()
		if (value.mode === 'schedule') {
			this.employment.set(value.employment)
			this.model.update(
				/** Period of the probation. */ (v) => ({
					...v,
					periodStart: value.hireDate ?? '',
					periodEnd: isoToday(),
				}),
			)
		} else if (value.mode === 'reviewer') {
			const suggested = value.review.suggestedReviewer ?? value.review.reviewer
			this.reviewer.set(suggested ? { id: suggested.accountId, name: suggested.name } : null)
		}
		this.draft.markClean()
	}

	/** Send the command, closing only after the server confirms it. */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		this.touched.set(true)
		const f = this.fields
		for (const field of [
			f.periodStart,
			f.periodEnd,
			f.dueDate,
			f.outcome,
			f.effectiveDate,
			f.extendedProbationEndDate,
			f.evidenceReference,
			f.reason,
		])
			if (field().invalid()) {
				field().focusBoundControl()
				return
			}
		const request = this.request()
		if (!request) return
		this.draft.saving.set(true)
		this.draft.error.set('')
		request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Close after commit. */ (review) => {
				this.draft.saving.set(false)
				this.draft.markClean()
				this.allowClose = true
				this.saved.emit({ message: this.outcome(review), review })
			},
			error: /** Preserve the draft and retry key. */ (error) => {
				this.draft.saving.set(false)
				this.draft.error.set(probationErrorMessage(error))
			},
		})
	}

	/** The request of the mode, or null when a required choice is missing. */
	private request(): Observable<ProbationReviewDto> | null {
		const v = this.model()
		const reason = v.reason.trim()
		const review = this.review()
		if (this.mode() === 'schedule') {
			const employment = this.employment()
			if (!employment) return null
			const body = {
				employmentId: employment.id,
				reviewType: v.reviewType,
				periodStart: v.periodStart,
				periodEnd: v.periodEnd,
				dueDate: v.dueDate,
				reviewerAccountId: this.reviewer()?.id ?? null,
				reason,
			}
			return this.api.schedule(body, this.draft.key(body))
		}
		if (!review) return null
		if (this.mode() === 'reviewer') {
			const reviewer = this.reviewer()
			if (!reviewer) return null
			const body = { reviewerAccountId: reviewer.id, expectedRevision: review.revision, reason }
			return this.api.command(review.id, 'reviewer', body, this.draft.key({ id: review.id, body }))
		}
		if (this.mode() === 'cancel') {
			const body = { expectedRevision: review.revision, reason }
			return this.api.command(
				review.id,
				'cancel',
				body,
				this.draft.key({ id: review.id, cancel: body }),
			)
		}
		const body: Record<string, unknown> = {
			outcome: v.outcome,
			effectiveDate: v.effectiveDate,
			reason,
			expectedRevision: review.revision,
		}
		if (v.outcome === 'Extend') body['extendedProbationEndDate'] = v.extendedProbationEndDate
		if (v.evidenceReference.trim()) body['evidenceReference'] = v.evidenceReference.trim()
		return this.api.command(review.id, 'decision', body, this.draft.key({ id: review.id, body }))
	}

	/** The confirmation of a committed command. */
	private outcome(review: ProbationReviewDto): string {
		if (this.mode() === 'schedule') return `The review was scheduled for ${review.workerName}.`
		if (this.mode() === 'reviewer')
			return `${review.reviewer?.name ?? 'The reviewer'} now reviews ${review.workerName}.`
		if (this.mode() === 'cancel') return 'The review was cancelled.'
		const decision = review.decision
		if (decision?.outcome === 'Extend')
			return `Probation was extended to ${decision.extendedProbationEndDate}; the next Final review is scheduled.`
		return `The decision was recorded: ${OUTCOME_LABELS[decision?.outcome ?? 'NoChange']}.`
	}

	/** Route Cancel and Escape through the same discard rule. */
	async cancel(): Promise<void> {
		if (await this.draft.canLeave()) {
			this.allowClose = true
			this.closed.emit()
		}
	}

	/** Keep dirty drafts when native Escape requests dismissal. */
	beforeClose(event: Event): void {
		if (event.target !== event.currentTarget || this.allowClose) return
		event.preventDefault()
		void this.cancel()
	}

	/** Allow the page's navigation guard to consult this draft. */
	canLeave(): Promise<boolean> {
		return this.draft.canLeave()
	}

	/** Release a pending navigation decision. */
	ngOnDestroy(): void {
		this.draft.release()
	}
}
