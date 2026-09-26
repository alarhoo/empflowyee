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
import { finalize, type Subscription } from 'rxjs'
import { Avatar } from '@fundamental-ngx/ui5-webcomponents/avatar'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Link } from '@fundamental-ngx/ui5-webcomponents/link'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableGrowing } from '@fundamental-ngx/ui5-webcomponents/table-growing'
import { TableRowActionNavigation } from '@fundamental-ngx/ui5-webcomponents/table-row-action-navigation'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	OrgChartApi,
	structureDenied,
	structureErrorMessage,
	structureMissing,
} from '@empflowyee/hcm-web-workforce-foundation-data-access'
import type {
	OrgChartNodeDto,
	OrgChartPersonDto,
} from '@empflowyee/hcm-workforce-foundation-contract'
import { initials, nodeName, nodeSubtitle } from './node-label'

/** Mid column: one person's organisation-visible details and their direct reports. */
@Component({
	selector: 'ef-hcm-org-chart-person',
	imports: [
		Avatar,
		Form,
		FormItem,
		Label,
		Text,
		Link,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableGrowing,
		TableRowActionNavigation,
		HcmObjectPage,
		HcmObjectSection,
	],
	templateUrl: './person-detail.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PersonDetailComponent {
	readonly assignmentId = input.required<string>()
	readonly opened = output<string>()
	readonly closed = output<void>()
	private readonly api = inject(OrgChartApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly name = nodeName
	readonly subtitle = nodeSubtitle
	readonly person = signal<OrgChartPersonDto | null>(null)
	readonly state = signal<'content' | 'loading' | 'error' | 'denied' | 'unavailable'>('loading')
	readonly message = signal('')
	readonly reports = signal<OrgChartNodeDto[]>([])
	readonly cursor = signal<string | null>(null)
	readonly loadingReports = signal(false)
	readonly avatar = computed(
		/** Initials of a shared name. */ () => initials(this.person()?.displayName),
	)
	readonly actions = [{ id: 'close', label: 'Close' }]

	/** Reload when the assignment or the verified context changes. */
	constructor() {
		effect(
			/** Track the inputs that define the visible data. */ () => {
				this.assignmentId()
				const context = this.runtime.context()
				untracked(
					/** Clear prior-context state before loading. */ () => {
						this.request?.unsubscribe()
						this.person.set(null)
						this.reports.set([])
						if (context) this.load()
					},
				)
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.request?.unsubscribe())
	}

	/** Load the person and the first page of reports. */
	load(): void {
		this.state.set('loading')
		this.message.set('')
		this.request = this.api
			.person(this.assignmentId())
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the person. */ (person) => {
					this.person.set(person)
					this.state.set('content')
					this.more(true)
				},
				error: /** Truthful failure state without stale data. */ (error) => {
					this.message.set(
						structureMissing(error)
							? 'This person is not in the current reporting structure.'
							: structureErrorMessage(error),
					)
					this.state.set(structureDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Load a page of direct reports. */
	more(first = false): void {
		if (this.loadingReports() || (!first && !this.cursor())) return
		this.loadingReports.set(true)
		this.api
			.reports(this.assignmentId(), first ? null : this.cursor(), 25)
			.pipe(
				takeUntilDestroyed(this.destroy),
				finalize(/** Release the pending state. */ () => this.loadingReports.set(false)),
			)
			.subscribe({
				next: /** Publish the page. */ (page) => {
					this.reports.update(
						/** Append on growing. */ (rows) => (first ? page.items : [...rows, ...page.items]),
					)
					this.cursor.set(page.nextCursor)
				},
				error: /** Keep what was loaded. */ (error) =>
					this.message.set(structureErrorMessage(error)),
			})
	}

	/** The deep link of a node. */
	href(id: string): string {
		return `/workforce-foundation/org-chart/${encodeURIComponent(id)}`
	}

	/** Route floorplan actions. */
	action(id: string): void {
		if (id === 'close') this.closed.emit()
	}

	/** Move to another node without leaving the app. */
	open(id: string | undefined, event?: Event): void {
		event?.preventDefault()
		if (id) this.opened.emit(id)
	}
}
