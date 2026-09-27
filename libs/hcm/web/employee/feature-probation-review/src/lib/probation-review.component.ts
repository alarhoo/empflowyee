import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	effect,
	inject,
	signal,
	untracked,
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
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
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
	ProbationReviewApi,
	employeeDenied,
	probationErrorMessage,
} from '@empflowyee/hcm-web-employee-data-access'
import { REVIEW_STATUSES, type ReviewerReviewSummaryDto } from '@empflowyee/hcm-employee-contract'
import { BASE_ROUTE, REVIEW_TYPE_LABELS, reviewState } from './labels'
import { ReviewerReviewComponent } from './reviewer-review.component'

/** Probation Review: native two-column FCL of the reviewer's assigned reviews and the selected one. */
@Component({
	selector: 'ef-hcm-probation-review',
	imports: [
		FormField,
		ObjectStatusComponent,
		FlexibleColumnLayout,
		Form,
		FormItem,
		Label,
		Select,
		Option,
		Button,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableGrowing,
		TableRowActionNavigation,
		HcmDynamicPage,
		HcmDatePipe,
		ReviewerReviewComponent,
	],
	templateUrl: './probation-review.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProbationReviewComponent {
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(ProbationReviewApi)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly state$ = reviewState
	readonly types = REVIEW_TYPE_LABELS
	readonly statuses = REVIEW_STATUSES
	readonly selected = toSignal(
		this.router.events.pipe(
			filter(/** Completed navigations only. */ (event) => event instanceof NavigationEnd),
			map(/** Read the child segment. */ () => this.childSelection()),
		),
		{ initialValue: this.childSelection() },
	)
	readonly reviews = signal<ReviewerReviewSummaryDto[]>([])
	readonly cursor = signal<string | null>(null)
	readonly filters = signal({ status: 'all' })
	readonly filterForm = form(this.filters)
	readonly state = signal<HcmPageState>('loading')
	readonly listState = signal<'loading' | 'content' | 'error'>('loading')
	readonly message = signal('')
	readonly noData = computed(
		/** Explain an empty table truthfully. */ () => {
			if (this.listState() === 'error') return 'Your reviews could not be loaded'
			if (this.filters().status !== 'all') return 'No review has this status'
			return 'No probation review is assigned to you'
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
						this.reviews.set([])
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

	/** Load a page of the reviewer's reviews; growing appends. */
	load(append: boolean): void {
		this.request?.unsubscribe()
		if (!append) this.listState.set('loading')
		this.message.set('')
		const status = this.filters().status
		this.request = this.api
			.list({
				...(status !== 'all' ? { status } : {}),
				...(append && this.cursor() ? { cursor: this.cursor() as string } : {}),
			})
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the page. */ (page) => {
					this.reviews.update(
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

	/** Open a review in the mid column. */
	open(reviewId: string | undefined): void {
		if (reviewId) void this.router.navigateByUrl(`${BASE_ROUTE}/${encodeURIComponent(reviewId)}`)
	}

	/** Open the assessment page. */
	assess(reviewId: string): void {
		void this.router.navigateByUrl(`${BASE_ROUTE}/${encodeURIComponent(reviewId)}/assessment`)
	}

	/** Close the review column. */
	close(): void {
		void this.router.navigateByUrl(BASE_ROUTE)
	}
}
