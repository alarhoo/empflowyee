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
import { forkJoin, type Subscription } from 'rxjs'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { Avatar } from '@fundamental-ngx/ui5-webcomponents/avatar'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableGrowing } from '@fundamental-ngx/ui5-webcomponents/table-growing'
import { TableRowActionNavigation } from '@fundamental-ngx/ui5-webcomponents/table-row-action-navigation'
import { Timeline } from '@fundamental-ngx/ui5-webcomponents-fiori/timeline'
import { TimelineItem } from '@fundamental-ngx/ui5-webcomponents-fiori/timeline-item'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import { LowerCasePipe } from '@angular/common'
import { HcmDatePipe } from '@empflowyee/hcm-web-runtime-context'
import {
	PositionsApi,
	jobArchitectureDenied,
	jobArchitectureErrorMessage,
	jobArchitectureMissing,
} from '@empflowyee/hcm-web-job-architecture-data-access'
import type {
	IncumbentDto,
	LifecycleRequestType,
	PositionChangeRequestSummaryDto,
	PositionDetailDto,
	PositionRelationshipDto,
	PositionVersionDto,
} from '@empflowyee/hcm-job-architecture-contract'
import {
	POSITION_TYPE_LABELS,
	REQUEST_TYPE_LABELS,
	decimal,
	initials,
	lifecycleRequests,
	lifecycleStatus,
	requestStatus,
} from './labels'

/** Mid column: one position with capacity, incumbents, relationships, versions and requests. */
@Component({
	selector: 'ef-hcm-position',
	imports: [
		ObjectStatusComponent,
		Form,
		FormItem,
		Label,
		Text,
		CheckBox,
		Avatar,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableGrowing,
		TableRowActionNavigation,
		Timeline,
		TimelineItem,
		HcmObjectPage,
		HcmObjectSection,
		HcmDatePipe,
		LowerCasePipe,
	],
	templateUrl: './position.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PositionComponent {
	readonly positionId = input.required<string>()
	readonly refresh = input(0)
	readonly canRequest = input(false)
	readonly changed = output<string>()
	readonly lifecycleRequested = output<{
		position: PositionDetailDto
		type: LifecycleRequestType
	}>()
	readonly requestOpened = output<string>()
	readonly closed = output<void>()
	private readonly api = inject(PositionsApi)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly lifecycle = lifecycleStatus
	readonly status = requestStatus
	readonly types = REQUEST_TYPE_LABELS
	readonly positionTypes = POSITION_TYPE_LABELS
	readonly decimal = decimal
	readonly initials = initials
	readonly position = signal<PositionDetailDto | null>(null)
	readonly incumbents = signal<IncumbentDto[]>([])
	readonly incumbentCursor = signal<string | null>(null)
	readonly versions = signal<PositionVersionDto[]>([])
	readonly requests = signal<PositionChangeRequestSummaryDto[]>([])
	readonly state = signal<'content' | 'loading' | 'error' | 'denied'>('loading')
	readonly message = signal('')
	readonly actions = computed(
		/** Requests allowed for the viewer and the position; one request is in flight at a time. */ () => {
			const position = this.position()
			const actions: { id: string; label: string; mutates?: boolean; emphasized?: boolean }[] = []
			if (position && this.canRequest() && !position.openRequest) {
				if (position.lifecycleStatus === 'Open' || position.lifecycleStatus === 'Frozen')
					actions.push({ id: 'change', label: 'Request change', mutates: true, emphasized: true })
				for (const type of lifecycleRequests(position.lifecycleStatus))
					actions.push({ id: `lifecycle-${type}`, label: type, mutates: true })
			}
			actions.push({ id: 'close', label: 'Close' })
			return actions
		},
	)

	/** Reload when the position or a refresh changes. */
	constructor() {
		effect(
			/** Track the inputs that define the visible data. */ () => {
				this.positionId()
				this.refresh()
				untracked(/** Load outside the reactive context. */ () => this.load())
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.request?.unsubscribe())
	}

	/** Load the position with its first pages of incumbents, versions and requests. */
	load(): void {
		this.request?.unsubscribe()
		if (this.position()?.id !== this.positionId()) this.state.set('loading')
		this.message.set('')
		const id = this.positionId()
		this.request = forkJoin({
			position: this.api.readPosition(id),
			incumbents: this.api.incumbents(id),
			versions: this.api.versions(id),
			requests: this.api.requests({ positionId: id }),
		})
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the position. */ (result) => {
					this.position.set(result.position)
					this.incumbents.set(result.incumbents.items)
					this.incumbentCursor.set(result.incumbents.nextCursor)
					this.versions.set(result.versions.items)
					this.requests.set(result.requests.items)
					this.state.set('content')
				},
				error: /** Truthful failure without stale data. */ (error) => {
					this.position.set(null)
					this.message.set(
						jobArchitectureMissing(error)
							? 'This position is no longer available.'
							: jobArchitectureErrorMessage(error),
					)
					this.state.set(jobArchitectureDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Load more incumbents. */
	moreIncumbents(): void {
		const cursor = this.incumbentCursor()
		if (!cursor) return
		this.api
			.incumbents(this.positionId(), cursor)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Append the page. */ (page) => {
					this.incumbents.update(/** Append. */ (rows) => [...rows, ...page.items])
					this.incumbentCursor.set(page.nextCursor)
				},
				error: /** Keep what is shown and explain. */ (error) =>
					this.message.set(jobArchitectureErrorMessage(error)),
			})
	}

	/** How a relationship reads from this position. */
	relation(relationship: PositionRelationshipDto): string {
		const kind = { SolidLine: 'solid line', DottedLine: 'dotted line', Functional: 'functional' }[
			relationship.type
		]
		return relationship.direction === 'Outgoing' ? `Reports to (${kind})` : `Reported by (${kind})`
	}

	/** Timeline wording of one version. */
	subtitle(version: PositionVersionDto): string {
		return `${version.headcountCapacity} seats, ${decimal(version.fteCapacity)} FTE · ${version.grade.code}${version.current ? ' · current' : ''}`
	}

	/** Open a listed change request. */
	openRequest(id: string | undefined): void {
		if (id) this.requestOpened.emit(id)
	}

	/** Route Object Page actions. */
	action(id: string): void {
		const position = this.position()
		if (id === 'close') this.closed.emit()
		else if (!position) return
		else if (id === 'change') this.changed.emit(position.id)
		else {
			const type = lifecycleRequests(position.lifecycleStatus).find(
				/** The requested lifecycle change. */ (candidate) => id === `lifecycle-${candidate}`,
			)
			if (type) this.lifecycleRequested.emit({ position, type })
		}
	}
}
