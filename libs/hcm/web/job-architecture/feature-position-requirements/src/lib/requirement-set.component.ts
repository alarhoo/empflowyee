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
	viewChild,
} from '@angular/core'
import { Router } from '@angular/router'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { forkJoin, map, of, switchMap, type Observable, type Subscription } from 'rxjs'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableRowAction } from '@fundamental-ngx/ui5-webcomponents/table-row-action'
import { TableRowActionNavigation } from '@fundamental-ngx/ui5-webcomponents/table-row-action-navigation'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import { HcmDatePipe } from '@empflowyee/hcm-web-runtime-context'
import {
	PositionsApi,
	jobArchitectureDenied,
	jobArchitectureErrorMessage,
	jobArchitectureMissing,
} from '@empflowyee/hcm-web-job-architecture-data-access'
import type {
	EffectiveRequirementDto,
	PositionChangeRequestDto,
	PositionChangeRequestSummaryDto,
	PositionDetailDto,
	RequirementDto,
	VarianceDraft,
	VarianceDto,
	VarianceType,
} from '@empflowyee/hcm-job-architecture-contract'
import {
	POSITIONS_ROUTE,
	TYPE_LABELS,
	minimum,
	requestStatus,
	sourceStatus,
	varianceStatus,
} from './labels'
import { VarianceDialog, type VarianceDialogInput } from './variance-dialog.component'
import { SubmitDialog } from './submit-dialog.component'

/** The editable form of a stored variance. */
export function draftOf(item: VarianceDto): VarianceDraft {
	return {
		code: item.code,
		varianceType: item.varianceType,
		sourceCode: item.sourceCode,
		type: item.type,
		name: item.name,
		description: item.description,
		proficiency: item.proficiency,
		minimumQuantity: item.minimumQuantity,
		unit: item.unit,
		mandatory: item.mandatory,
		justification: item.varianceType === 'Waive' ? item.justification : null,
	}
}

/** Mid column: effective, proposed and profile requirements of one position, and its history. */
@Component({
	selector: 'ef-hcm-position-requirement-set',
	imports: [
		ObjectStatusComponent,
		Text,
		CheckBox,
		MessageStrip,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableRowAction,
		TableRowActionNavigation,
		HcmObjectPage,
		HcmObjectSection,
		HcmDatePipe,
		VarianceDialog,
		SubmitDialog,
	],
	templateUrl: './requirement-set.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PositionRequirementSetComponent {
	readonly positionId = input.required<string>()
	readonly refresh = input(0)
	readonly canRequest = input(false)
	readonly updated = output<string>()
	readonly closed = output<void>()
	private readonly api = inject(PositionsApi)
	private readonly router = inject(Router)
	private readonly destroy = inject(DestroyRef)
	private read?: Subscription
	/** Retry keys per removal and revision, so a repeated click never applies twice. */
	private readonly keys = new Map<string, string>()
	readonly source = sourceStatus
	readonly variance = varianceStatus
	readonly status = requestStatus
	readonly minimum = minimum
	readonly position = signal<PositionDetailDto | null>(null)
	readonly effective = signal<EffectiveRequirementDto[]>([])
	readonly profile = signal<RequirementDto[]>([])
	readonly history = signal<PositionChangeRequestSummaryDto[]>([])
	readonly open = signal<PositionChangeRequestDto | null>(null)
	readonly state = signal<'content' | 'loading' | 'error' | 'denied'>('loading')
	readonly message = signal('')
	readonly commandError = signal('')
	readonly busy = signal(false)
	readonly varianceDialog = signal<VarianceDialogInput | null>(null)
	readonly submitting = signal(false)
	private readonly varianceEditor = viewChild(VarianceDialog)
	/** The requester's own draft Change request, which variance commands edit. */
	readonly draft = computed(
		/** Editable only by its requester while Draft or Previewed. */ () => {
			const request = this.open()
			return request?.requestType === 'Change' &&
				request.requestedByMe &&
				(request.status === 'Draft' || request.status === 'Previewed')
				? request
				: null
		},
	)
	readonly canPropose = computed(
		/** A proposal starts only on an open or frozen position without another request. */ () => {
			const position = this.position()
			if (!this.canRequest() || !position?.currentVersion) return false
			if (this.draft()) return true
			return !position.openRequest && ['Open', 'Frozen'].includes(position.lifecycleStatus)
		},
	)
	readonly actions = computed(
		/** Variance commands, submission and the link to the request in Positions. */ () => {
			const actions: { id: string; label: string; mutates?: boolean; emphasized?: boolean }[] = []
			const draft = this.draft()
			if (draft?.variances.length)
				actions.push({
					id: 'submit',
					label: 'Submit for approval',
					mutates: true,
					emphasized: true,
				})
			if (this.canPropose())
				for (const type of ['Add', 'Replace', 'Strengthen', 'Waive'] as const)
					actions.push({ id: type, label: TYPE_LABELS[type], mutates: true })
			if (this.position()?.openRequest)
				actions.push({ id: 'positions', label: 'Open in Positions' })
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
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.read?.unsubscribe())
	}

	/** Load the position, its requirement sets, history and any request in flight. */
	load(): void {
		this.read?.unsubscribe()
		if (this.position()?.id !== this.positionId()) this.state.set('loading')
		this.message.set('')
		const id = this.positionId()
		this.read = forkJoin({
			position: this.api.readPosition(id),
			effective: this.api.effectiveRequirements(id),
			profile: this.api.profileRequirements(id),
			history: this.api.requests({ positionId: id }),
		})
			.pipe(
				switchMap(
					/** Read the request in flight, if any. */ (result) => {
						const open: Observable<PositionChangeRequestDto | null> = result.position.openRequest
							? this.api.readRequest(result.position.openRequest.id)
							: of(null)
						return open.pipe(map(/** Combine. */ (request) => ({ ...result, open: request })))
					},
				),
				takeUntilDestroyed(this.destroy),
			)
			.subscribe({
				next: /** Publish the position. */ (result) => {
					this.position.set(result.position)
					this.effective.set(result.effective.items)
					this.profile.set(result.profile.items)
					this.history.set(result.history.items)
					this.open.set(result.open)
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

	/** Route Object Page actions. */
	action(id: string): void {
		const position = this.position()
		if (id === 'close') this.closed.emit()
		else if (!position) return
		else if (id === 'submit') this.submitting.set(true)
		else if (id === 'positions' && position.openRequest)
			void this.router.navigateByUrl(
				`${POSITIONS_ROUTE}/${encodeURIComponent(position.id)}/requests/${encodeURIComponent(position.openRequest.id)}`,
			)
		else if (id === 'Add' || id === 'Replace' || id === 'Strengthen' || id === 'Waive')
			this.propose(id)
	}

	/** Open the variance Dialog of one type. */
	private propose(type: VarianceType): void {
		const position = this.position()
		if (!position) return
		this.commandError.set('')
		this.varianceDialog.set({
			type,
			positionId: position.id,
			profile: this.profile(),
			variances: (this.draft()?.variances ?? []).map(draftOf),
			request: this.draft(),
		})
	}

	/** Remove one proposed variance from the draft. */
	remove(code: string | undefined): void {
		const draft = this.draft()
		if (!draft || !code || this.busy()) return
		const name = `remove:${draft.id}:${draft.revision}:${code}`
		let key = this.keys.get(name)
		if (!key) {
			key = crypto.randomUUID()
			this.keys.set(name, key)
		}
		const variances = draft.variances
			.filter(/** Keep the others. */ (item) => item.code !== code)
			.map(draftOf)
		this.busy.set(true)
		this.commandError.set('')
		this.api
			.updateRequirementChange(draft.id, { variances, expectedRevision: draft.revision }, key)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Show the committed proposal. */ () => {
					this.busy.set(false)
					this.changed(`Variance ${code} removed from the proposal.`)
				},
				error: /** Keep the proposal and explain. */ (error) => {
					this.busy.set(false)
					this.commandError.set(jobArchitectureErrorMessage(error))
				},
			})
	}

	/** A command committed: reload and tell the shell. */
	changed(message: string): void {
		this.varianceDialog.set(null)
		this.submitting.set(false)
		this.load()
		this.updated.emit(message)
	}

	/** Consult an open variance draft before leaving. */
	canLeave(): Promise<boolean> {
		return this.varianceEditor()?.canLeave() ?? Promise.resolve(true)
	}
}
