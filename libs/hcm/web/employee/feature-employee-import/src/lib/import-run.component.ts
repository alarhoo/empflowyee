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
import { form, FormField } from '@angular/forms/signals'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableGrowing } from '@fundamental-ngx/ui5-webcomponents/table-growing'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import { HcmDatePipe } from '@empflowyee/hcm-web-runtime-context'
import {
	EmployeeImportApi,
	employeeDenied,
	employeeMissing,
	importErrorMessage,
} from '@empflowyee/hcm-web-employee-data-access'
import {
	MATCH_STATUSES,
	ROW_STATUSES,
	type ImportRowDto,
	type ImportRunDetailDto,
} from '@empflowyee/hcm-employee-contract'
import {
	ACTION_LABELS,
	PROPOSED_LABELS,
	RESOLUTION_LABELS,
	failureText,
	matchStatus,
	rowStatus,
	runStatus,
	saveFile,
} from './labels'
import type { ImportDialogInput } from './import-dialog.component'
import type { ResolveInput } from './resolve-dialog.component'

/** Mid column: one import run with its counts, rows and file-level issues. */
@Component({
	selector: 'ef-hcm-import-run',
	imports: [
		FormField,
		ObjectStatusComponent,
		Form,
		FormItem,
		Label,
		Text,
		Select,
		Option,
		Button,
		MessageStrip,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableGrowing,
		HcmObjectPage,
		HcmObjectSection,
		HcmDatePipe,
	],
	templateUrl: './import-run.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportRunComponent {
	readonly runId = input.required<string>()
	readonly refresh = input(0)
	readonly dialogRequested = output<ImportDialogInput>()
	readonly resolveRequested = output<ResolveInput>()
	readonly closed = output<void>()
	private readonly api = inject(EmployeeImportApi)
	private readonly destroy = inject(DestroyRef)
	private load$?: Subscription
	private rows$?: Subscription
	readonly status = runStatus
	readonly rowStatus = rowStatus
	readonly matchStatus = matchStatus
	readonly actionLabels = ACTION_LABELS
	readonly proposedLabels = PROPOSED_LABELS
	readonly resolutionLabels = RESOLUTION_LABELS
	readonly failure = failureText
	readonly rowStatuses = ROW_STATUSES
	readonly matchStatuses = MATCH_STATUSES
	readonly run = signal<ImportRunDetailDto | null>(null)
	readonly rows = signal<ImportRowDto[]>([])
	readonly cursor = signal<string | null>(null)
	readonly rowState = signal<'loading' | 'content' | 'error'>('loading')
	readonly rowFilters = signal({ status: 'all', matchStatus: 'all' })
	readonly rowForm = form(this.rowFilters)
	readonly pageState = signal<'content' | 'loading' | 'error' | 'denied'>('loading')
	readonly message = signal('')
	readonly notice = signal('')
	readonly resolvable = computed(
		/** Matched rows can be resolved while a managed run waits for commit. */ () => {
			const run = this.run()
			return run?.status === 'ReadyToCommit' && run.actions.cancel
		},
	)
	readonly actions = computed(
		/** Commands the server says the viewer may use. */ () => {
			const run = this.run()
			const actions: { id: string; label: string; mutates?: boolean; emphasized?: boolean }[] = []
			if (run?.actions.validate)
				actions.push({ id: 'validate', label: 'Validate', mutates: true, emphasized: true })
			if (run?.actions.commit)
				actions.push({ id: 'commit', label: 'Commit', mutates: true, emphasized: true })
			if (run?.issueCount) actions.push({ id: 'report', label: 'Download issue report' })
			if (run?.actions.cancel) actions.push({ id: 'cancel', label: 'Cancel run', mutates: true })
			actions.push({ id: 'close', label: 'Close' })
			return actions
		},
	)

	/** Reload when the run or a refresh changes. */
	constructor() {
		effect(
			/** Track the inputs that define the visible data. */ () => {
				this.runId()
				this.refresh()
				untracked(/** Load outside the reactive context. */ () => this.load())
			},
		)
		this.destroy.onDestroy(
			/** Cancel in-flight reads. */ () => {
				this.load$?.unsubscribe()
				this.rows$?.unsubscribe()
			},
		)
	}

	/** Load the run and its first page of rows. */
	load(): void {
		this.load$?.unsubscribe()
		if (this.run()?.id !== this.runId()) this.pageState.set('loading')
		this.message.set('')
		this.load$ = this.api
			.readRun(this.runId())
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the run. */ (run) => {
					this.run.set(run)
					this.pageState.set('content')
					this.loadRows(false)
				},
				error: /** Truthful failure without stale data. */ (error) => {
					this.run.set(null)
					this.rows.set([])
					this.message.set(
						employeeMissing(error) ? 'This run is no longer available.' : importErrorMessage(error),
					)
					this.pageState.set(employeeDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Load a page of rows for the applied filters; growing appends. */
	loadRows(append: boolean): void {
		this.rows$?.unsubscribe()
		if (!append) this.rowState.set('loading')
		const f = this.rowFilters()
		this.rows$ = this.api
			.rows(this.runId(), {
				...(f.status !== 'all' ? { status: f.status } : {}),
				...(f.matchStatus !== 'all' ? { matchStatus: f.matchStatus } : {}),
				...(append && this.cursor() ? { cursor: this.cursor() as string } : {}),
			})
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the page. */ (page) => {
					this.rows.update(
						/** Append on growing. */ (rows) => (append ? [...rows, ...page.items] : page.items),
					)
					this.cursor.set(page.nextCursor)
					this.rowState.set('content')
				},
				error: /** Explain without stale rows. */ (error) => {
					if (!append) this.rows.set([])
					this.message.set(importErrorMessage(error))
					this.rowState.set('error')
				},
			})
	}

	/** The text of a row's issues. */
	issueText(row: ImportRowDto): string {
		if (row.failureCode) return this.failure(row.failureCode)
		return row.issues
			.map(
				/** One issue. */ (item) =>
					item.fieldName ? `${item.fieldName}: ${item.message}` : item.message,
			)
			.join(' ')
	}

	/** A row's resolution text. */
	resolutionText(row: ImportRowDto): string {
		if (!row.resolution) return row.needsResolution ? 'Needed' : '—'
		const worker = row.candidates.find(
			/** Chosen. */ (item) => item.workerId === row.resolutionWorkerId,
		)
		return worker
			? `${this.resolutionLabels[row.resolution]}: ${worker.name}`
			: this.resolutionLabels[row.resolution]
	}

	/** Whether a row can be resolved now. */
	canResolve(row: ImportRowDto): boolean {
		return (
			this.resolvable() === true &&
			row.status === 'Valid' &&
			(row.matchStatus === 'Unique' || row.matchStatus === 'Ambiguous')
		)
	}

	/** Explain an empty row table truthfully. */
	rowsEmpty(): string {
		if (this.rowState() === 'error') return 'Rows could not be loaded'
		if (this.run()?.status === 'Uploaded') return 'Rows appear after validation'
		return 'No rows match these filters'
	}

	/** Ask the shell to open the resolution dialog for a row. */
	resolve(row: ImportRowDto): void {
		this.resolveRequested.emit({ runId: this.runId(), row })
	}

	/** Route Object Page actions. */
	action(id: string): void {
		const run = this.run()
		if (id === 'close') this.closed.emit()
		else if (!run) return
		else if (id === 'report') this.report(run.id)
		else if (id === 'validate' || id === 'commit' || id === 'cancel')
			this.dialogRequested.emit({ mode: id, run })
	}

	/** Download the safe issue report. */
	private report(id: string): void {
		this.api
			.report(id)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Save the CSV. */ (blob) => {
					saveFile(blob, `import-issues-${id}.csv`)
					this.notice.set(
						'The issue report was downloaded. It lists row numbers, fields and codes only.',
					)
				},
				error: /** Explain. */ (error) => this.message.set(importErrorMessage(error)),
			})
	}
}
