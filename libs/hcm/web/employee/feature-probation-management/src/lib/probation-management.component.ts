import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	effect,
	inject,
	signal,
	untracked,
	viewChild,
} from '@angular/core'
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { filter, map, type Subscription } from 'rxjs'
import { form, FormField } from '@angular/forms/signals'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { FlexibleColumnLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { SegmentedButton } from '@fundamental-ngx/ui5-webcomponents/segmented-button'
import { SegmentedButtonItem } from '@fundamental-ngx/ui5-webcomponents/segmented-button-item'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableGrowing } from '@fundamental-ngx/ui5-webcomponents/table-growing'
import { TableRowActionNavigation } from '@fundamental-ngx/ui5-webcomponents/table-row-action-navigation'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmDatePipe, HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	ProbationManagementApi,
	employeeDenied,
	probationErrorMessage,
} from '@empflowyee/hcm-web-employee-data-access'
import type {
	ProbationCaseDto,
	ProbationReviewDto,
	ProbationView,
} from '@empflowyee/hcm-employee-contract'
import {
	BASE_ROUTE,
	MANAGE_PERMISSION,
	REVIEW_TYPE_LABELS,
	probationStatus,
	reviewState,
} from './labels'
import { ReviewPageComponent } from './review-page.component'
import { ProbationDialog, type ProbationDialogInput } from './probation-dialog.component'

/** Probation Management: native two-column FCL of probation cases and the selected review. */
@Component({
	selector: 'ef-hcm-probation-management',
	imports: [
		FormField,
		ObjectStatusComponent,
		FlexibleColumnLayout,
		Form,
		FormItem,
		Label,
		Input,
		Button,
		SegmentedButton,
		SegmentedButtonItem,
		MessageStrip,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableGrowing,
		TableRowActionNavigation,
		HcmDynamicPage,
		HcmDatePipe,
		ReviewPageComponent,
		ProbationDialog,
	],
	templateUrl: './probation-management.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProbationManagementComponent {
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(ProbationManagementApi)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly state$ = reviewState
	readonly probation = probationStatus
	readonly types = REVIEW_TYPE_LABELS
	readonly selected = toSignal(
		this.router.events.pipe(
			filter(/** Completed navigations only. */ (event) => event instanceof NavigationEnd),
			map(/** Read the child segment. */ () => this.childSelection()),
		),
		{ initialValue: this.childSelection() },
	)
	readonly view = signal<ProbationView>('all')
	readonly cases = signal<ProbationCaseDto[]>([])
	readonly cursor = signal<string | null>(null)
	readonly filters = signal({ q: '' })
	readonly filterForm = form(this.filters)
	readonly state = signal<HcmPageState>('loading')
	readonly listState = signal<'loading' | 'content' | 'error'>('loading')
	readonly message = signal('')
	readonly notice = signal('')
	readonly refresh = signal(0)
	readonly dialog = signal<ProbationDialogInput | null>(null)
	private readonly dialogEditor = viewChild(ProbationDialog)
	readonly canManage = computed(
		/** Presentation only; every endpoint re-authorizes on the server. */ () =>
			this.runtime.context()?.access.permissions.includes(MANAGE_PERMISSION) === true,
	)
	readonly actions = computed(
		/** Reviews are scheduled in a Dialog. */ () =>
			this.canManage()
				? [{ id: 'schedule', label: 'Schedule review', mutates: true, emphasized: true }]
				: [],
	)
	readonly noData = computed(
		/** Explain an empty table truthfully. */ () => {
			if (this.listState() === 'error') return 'Probation cases could not be loaded'
			if (this.view() === 'overdue') return 'No review is overdue'
			if (this.view() === 'due-soon') return 'No review is due in the next 30 days'
			return 'Nobody is in probation'
		},
	)
	readonly layout = computed(
		/** Show the review column only for a selection. */ () =>
			this.selected() ? 'TwoColumnsMidExpanded' : 'OneColumn',
	)

	/** Reload when the verified context changes. */
	constructor() {
		effect(
			/** Track the context that defines the data. */ () => {
				const context = this.runtime.context()
				untracked(
					/** Clear prior-context state before loading. */ () => {
						this.request?.unsubscribe()
						this.cases.set([])
						this.dialog.set(null)
						if (context) this.load(false)
					},
				)
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.request?.unsubscribe())
	}

	/** The selected review from the child route segment. */
	private childSelection(): string | null {
		return this.route.snapshot.firstChild?.paramMap.get('reviewId') ?? null
	}

	/** Load a page of cases for the view; growing appends. */
	load(append: boolean): void {
		this.request?.unsubscribe()
		if (!append) this.listState.set('loading')
		this.message.set('')
		const q = this.filters().q.trim()
		this.request = this.api
			.cases({
				view: this.view(),
				...(q ? { q } : {}),
				...(append && this.cursor() ? { cursor: this.cursor() as string } : {}),
			})
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the page. */ (page) => {
					this.cases.update(
						/** Append on growing. */ (rows) => (append ? [...rows, ...page.items] : page.items),
					)
					this.cursor.set(page.nextCursor)
					this.listState.set('content')
					this.state.set('content')
				},
				error: /** Publish a failure truthfully. */ (error) => {
					this.message.set(probationErrorMessage(error))
					if (employeeDenied(error)) this.state.set('denied')
					else this.listState.set('error')
					if (this.state() === 'loading') this.state.set('error')
				},
			})
	}

	/** Switch between due soon, overdue and all cases. */
	chooseView(item: HTMLElement | undefined): void {
		const view = item?.dataset['view'] as ProbationView | undefined
		if (view && view !== this.view()) {
			this.view.set(view)
			this.load(false)
		}
	}

	/** Open a case's next review, or offer to schedule one when none is open. */
	open(employmentId: string | undefined): void {
		const item = this.cases().find(/** The case. */ (row) => row.employmentId === employmentId)
		if (!item) return
		if (item.nextReview) this.openReview(item.nextReview.id)
		else if (this.canManage())
			this.dialog.set({
				mode: 'schedule',
				employment: { id: item.employmentId, name: item.workerName },
				hireDate: item.hireDate,
				probationEndDate: item.probationEndDate,
			})
	}

	/** Open a review in the mid column. */
	openReview(reviewId: string): void {
		void this.router.navigateByUrl(`${BASE_ROUTE}/${encodeURIComponent(reviewId)}`)
	}

	/** Close the review column. */
	close(): void {
		void this.router.navigateByUrl(BASE_ROUTE)
	}

	/** Route list actions. */
	action(id: string): void {
		if (id === 'schedule' && this.canManage())
			this.dialog.set({ mode: 'schedule', employment: null })
	}

	/** A dialog committed a command: refresh and show the review. */
	dialogSaved(result: { message: string; review: ProbationReviewDto }): void {
		this.dialog.set(null)
		this.notice.set(result.message)
		this.refresh.update(/** Invalidate the review. */ (count) => count + 1)
		this.load(false)
		if (this.selected() !== result.review.id) this.openReview(result.review.id)
	}

	/** Consult any open dialog draft before leaving the feature. */
	canLeave(): Promise<boolean> {
		return this.dialogEditor()?.canLeave() ?? Promise.resolve(true)
	}
}
