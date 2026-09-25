import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { HcmDatePipe } from '@empflowyee/hcm-web-runtime-context'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	ElementRef,
	Injector,
	afterNextRender,
	computed,
	effect,
	inject,
	input,
	output,
	signal,
	untracked,
	viewChild,
} from '@angular/core'
import { forkJoin, type Subscription } from 'rxjs'
import { form, FormField } from '@angular/forms/signals'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { HttpErrorResponse } from '@angular/common/http'
import getActiveElement from '@ui5/webcomponents-base/dist/util/getActiveElement.js'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import type { HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { ReviewApi, reviewErrorMessage } from '@empflowyee/hcm-web-access-control-data-access'
import type { ReviewSummary, ReviewItem } from '@empflowyee/hcm-access-control-contract'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { ReviewDialogComponent, type ReviewAction } from './review-dialog.component'
@Component({
	selector: 'ef-hcm-review-detail',
	imports: [
		ObjectStatusComponent,
		HcmDatePipe,
		Text,
		HcmObjectPage,
		HcmObjectSection,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		Button,
		MessageStrip,
		ReviewDialogComponent,
		Select,
		Option,
		Form,
		FormItem,
		Label,
		FormField,
	],
	templateUrl: './review-detail.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewDetailComponent {
	readonly reviewId = input.required<string>()
	readonly closed = output<void>()
	readonly changed = output<void>()
	private readonly api = inject(ReviewApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	private readonly injector = inject(Injector)
	private readonly host = inject<ElementRef<HTMLElement>>(ElementRef)
	private focusOrigin: HTMLElement | null = null
	readonly review = signal<ReviewSummary | null>(null)
	readonly rows = signal<ReviewItem[]>([])
	readonly cursor = signal<string | null>(null)
	readonly filters = signal({ decision: '' })
	readonly filterForm = form(this.filters)
	private appliedDecision = ''
	private request?: Subscription
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly notice = signal('')
	readonly busy = signal(false)
	readonly edit = signal<ReviewAction | null>(null)
	readonly dialog = viewChild(ReviewDialogComponent)
	readonly canManage = computed(
		/** Expose current capability without replacing server authorization. */ () =>
			this.runtime.context()?.access.permissions.includes('hcm.access-control.reviews.manage') ===
			true,
	)
	readonly actions = computed(
		/** Provide closure only for a loaded Open review. */ () => [
			{ id: 'back', label: 'Back to reviews' },
			...(this.canManage() && this.review()?.status === 'Open'
				? [{ id: 'close', label: 'Close review', mutates: true, disabled: this.busy() }]
				: []),
			{ id: 'reload', label: 'Reload evidence', disabled: this.busy() },
		],
	)
	/** Load a fresh review for this keyed routed selection. */
	constructor() {
		effect(
			/** Watch context replacement while keeping HTTP outside reactive dependency collection. */ () => {
				this.reviewId()
				this.runtime.context()
				untracked(
					/** The runtime interceptor separately owns request-context cancellation. */ () =>
						this.load(),
				)
			},
		)
	}
	/** Resolve the selected parent and the current filtered snapshot page together. */
	load(): void {
		this.request?.unsubscribe()
		this.state.set('loading')
		this.review.set(null)
		this.rows.set([])
		this.cursor.set(null)
		this.message.set('')
		this.busy.set(true)
		this.appliedDecision = this.filters().decision
		this.request = forkJoin({
			review: this.api.get(this.reviewId()),
			page: this.api.items(this.reviewId(), this.appliedDecision),
		})
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish only this selected review's authorized evidence. */ ({
					review,
					page,
				}) => {
					this.review.set(review)
					this.rows.set(page.items)
					this.cursor.set(page.nextCursor)
					this.busy.set(false)
					this.state.set('content')
				},
				error: /** Distinguish missing and denied objects from an empty snapshot. */ (error) => {
					this.busy.set(false)
					this.message.set(reviewErrorMessage(error))
					this.state.set(
						error instanceof HttpErrorResponse && [401, 403].includes(error.status)
							? 'denied'
							: 'error',
					)
				},
			})
	}
	/** Continue the fixed server ID ordering without re-filtering browser rows. */
	more(): void {
		const cursor = this.cursor()
		if (!cursor || this.busy()) return
		this.busy.set(true)
		this.request = this.api
			.items(this.reviewId(), this.appliedDecision, cursor)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Append only explicit server continuation. */ (page) => {
					this.rows.update(
						/** Preserve already loaded snapshots. */ (rows) => [...rows, ...page.items],
					)
					this.cursor.set(page.nextCursor)
					this.busy.set(false)
				},
				error: /** Keep loaded evidence available for safe retry. */ (error) => {
					this.message.set(reviewErrorMessage(error))
					this.busy.set(false)
				},
			})
	}
	/** Capture the displayed immutable evidence and revision for a focused confirmation. */
	openAction(
		operation: 'decide' | 'refresh' | 'close',
		item?: ReviewItem,
		decision?: 'Retain' | 'Revoke',
	): void {
		const review = this.review()
		if (!review || review.status !== 'Open' || !this.canManage() || this.busy()) return
		this.focusOrigin = getActiveElement() as HTMLElement | null
		this.edit.set({ operation, review, item, decision })
	}
	/** Describe drift without suggesting an unavailable refresh on closed historical evidence. */
	evidence(item: ReviewItem): string {
		if (item.stale)
			return this.review()?.status === 'Closed'
				? 'Changed since snapshot'
				: 'Changed — refresh required'
		return item.decision === 'Revoke' || item.decision === 'Removed'
			? 'Historical outcome'
			: 'Current'
	}
	/** Handle navigation separately from explicit domain commands. */
	action(id: string): void {
		if (id === 'back') this.closed.emit()
		else if (id === 'close') this.openAction('close')
		else if (id === 'reload') this.load()
	}
	/** Refresh real state after commit and restore focus once native controls finish rendering. */
	closeDialog(committed: string | null): void {
		this.edit.set(null)
		if (committed) {
			this.notice.set('Review changes saved.')
			this.load()
			this.changed.emit()
		}
		afterNextRender(
			/** Restore the invoking control or a stable object action after a removed grant. */ () =>
				requestAnimationFrame(
					/** Avoid focusing destroyed context after navigation. */ () => {
						if (!this.destroy.destroyed)
							(this.focusOrigin?.isConnected
								? this.focusOrigin
								: this.host.nativeElement.querySelector<HTMLElement>('ui5-toolbar-button')
							)?.focus()
					},
				),
			{ injector: this.injector },
		)
	}
	/** Share one dirty-draft guard across query selection, navigation and persona switches. */
	canLeave(): Promise<boolean> {
		return this.dialog()?.canLeave() ?? Promise.resolve(true)
	}
}
