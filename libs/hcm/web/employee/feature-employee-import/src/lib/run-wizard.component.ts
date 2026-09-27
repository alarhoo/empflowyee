import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	type OnDestroy,
	type OnInit,
	computed,
	inject,
	signal,
	viewChild,
} from '@angular/core'
import { Router } from '@angular/router'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { forkJoin, type Observable } from 'rxjs'
import { form, FormField, required } from '@angular/forms/signals'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { FileUploader } from '@fundamental-ngx/ui5-webcomponents/file-uploader'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import {
	HcmWizardPage,
	HcmWizardStep,
	type HcmWizardMove,
	type HcmWizardState,
} from '@empflowyee/hcm-web-ux-floorplan-wizard'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	EmployeeImportApi,
	employeeDenied,
	importErrorMessage,
} from '@empflowyee/hcm-web-employee-data-access'
import {
	IMPORT_ACTIONS,
	type ImportRowDto,
	type ImportRunDetailDto,
	type ImportTemplateDto,
} from '@empflowyee/hcm-employee-contract'
import {
	ACTION_LABELS,
	BASE_ROUTE,
	MANAGE_PERMISSION,
	PROPOSED_LABELS,
	RESOLUTION_LABELS,
	failureText,
	matchStatus,
	runStatus,
} from './labels'
import { ResolveDialog, type ResolveInput } from './resolve-dialog.component'

const STEPS = ['source', 'upload', 'validate', 'matches', 'commit'] as const
type Step = (typeof STEPS)[number]
const MAX_BYTES = 5 * 1024 * 1024

/**
 * Dedicated wizard route for one import run. Each step unlocks only after the server confirms
 * the previous one: the upload creates the run, validation checks every row without side
 * effects, every matched row is resolved (DEC-HCM2-001), and commit applies the rows.
 */
@Component({
	selector: 'ef-hcm-import-run-wizard',
	imports: [
		FormField,
		ObjectStatusComponent,
		Form,
		FormItem,
		Label,
		Select,
		Option,
		FileUploader,
		Button,
		Text,
		MessageStrip,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		HcmWizardPage,
		HcmWizardStep,
		HcmDiscardDialog,
		ResolveDialog,
	],
	templateUrl: './run-wizard.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunWizardComponent implements OnInit, OnDestroy {
	private readonly router = inject(Router)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(EmployeeImportApi)
	private readonly destroy = inject(DestroyRef)
	private allowLeave = false
	readonly actions = IMPORT_ACTIONS
	readonly actionLabels = ACTION_LABELS
	readonly proposedLabels = PROPOSED_LABELS
	readonly resolutionLabels = RESOLUTION_LABELS
	readonly status = runStatus
	readonly matchStatus = matchStatus
	readonly failure = failureText
	readonly state = signal<HcmWizardState>('loading')
	readonly message = signal('')
	readonly current = signal<Step>('source')
	readonly reachable = signal<Step>('source')
	readonly templates = signal<ImportTemplateDto[]>([])
	readonly model = signal({ templateId: '', intendedAction: 'Create' })
	readonly fields = form(
		this.model,
		/** Both choices are required. */ (path) => {
			required(path.templateId)
			required(path.intendedAction)
		},
	)
	readonly file = signal<File | null>(null)
	readonly fileTouched = signal(false)
	readonly run = signal<ImportRunDetailDto | null>(null)
	readonly matches = signal<ImportRowDto[]>([])
	readonly matchesLoading = signal(false)
	readonly resolving = signal<ResolveInput | null>(null)
	private readonly resolveEditor = viewChild(ResolveDialog)
	readonly template = computed(
		/** The chosen template. */ () =>
			this.templates().find(/** Chosen. */ (item) => item.id === this.model().templateId) ?? null,
	)
	readonly accept = computed(
		/** File types of the chosen format. */ () =>
			this.template()?.fileFormat === 'Xlsx' ? '.xlsx' : '.csv',
	)
	readonly locked = computed(
		/** The file and choices are fixed once the run exists. */ () => this.run() !== null,
	)
	readonly draft = new HcmDraft(
		/** Track the choices and file. */ () => ({
			...this.model(),
			file: this.file()?.name ?? null,
			run: this.run()?.id ?? null,
		}),
	)

	/** Load the published templates. */
	ngOnInit(): void {
		if (this.runtime.context()?.access.permissions.includes(MANAGE_PERMISSION) !== true) {
			this.state.set('denied')
			return
		}
		this.api
			.templates({ status: 'Published' })
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Offer the templates. */ (page) => {
					this.templates.set(page.items)
					this.state.set('content')
					this.draft.markClean()
				},
				error: /** Truthful failure. */ (error) => {
					this.message.set(importErrorMessage(error))
					this.state.set(employeeDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Keep the chosen file in memory; a new choice replaces the old one. */
	chooseFile(event: Event): void {
		const target = event.target as HTMLElement & { files: FileList | null }
		const file = target.files?.item(0) ?? null
		this.fileTouched.set(true)
		this.draft.error.set('')
		if (file && (file.size < 1 || file.size > MAX_BYTES)) {
			this.draft.error.set('Choose a nonempty file no larger than 5 MiB.')
			this.file.set(null)
			return
		}
		this.file.set(file)
	}

	/** Refuse a file above the size limit before it is read. */
	rejectFile(): void {
		this.file.set(null)
		this.fileTouched.set(true)
		this.draft.error.set('Choose a file no larger than 5 MiB.')
	}

	/** Validate the current step with the server, then move forward. */
	next(move: HcmWizardMove): void {
		if (this.draft.saving()) return
		const from = move.from as Step
		if (from === 'source') this.leaveSource()
		else if (from === 'upload') this.upload()
		else if (from === 'validate') this.validate()
		else if (from === 'matches') this.confirmMatches()
		else this.go(move.to as Step)
	}

	/** The template and action are chosen. */
	private leaveSource(): void {
		this.fields().markAsTouched()
		for (const field of [this.fields.templateId, this.fields.intendedAction])
			if (field().invalid()) {
				field().focusBoundControl()
				return
			}
		this.go('upload')
	}

	/** Upload the file once; the server creates the run. */
	private upload(): void {
		if (this.run()) {
			this.go('validate')
			return
		}
		this.fileTouched.set(true)
		const file = this.file()
		if (!file) return
		const metadata = {
			templateId: this.model().templateId,
			intendedAction: this.model().intendedAction,
		}
		const key = this.draft.key({
			...metadata,
			file: file.name,
			size: file.size,
			modified: file.lastModified,
		})
		this.send(
			this.api.upload(metadata, file, key),
			/** Created. */ (run) => {
				this.run.set(run)
				this.go('validate')
			},
		)
	}

	/** Validate an uploaded run; move on only when it is ready to commit. */
	private validate(): void {
		const run = this.run()
		if (!run) return
		if (run.status === 'ReadyToCommit') {
			this.loadMatches()
			return
		}
		if (run.status !== 'Uploaded') return
		const body = { expectedRevision: run.revision }
		this.send(
			this.api.command(run.id, 'validate', body, this.draft.key({ validate: run.id, body })),
			/** Checked. */ (checked) => {
				this.run.set(checked)
				if (checked.status === 'ReadyToCommit') this.loadMatches()
			},
		)
	}

	/** Load the matched rows that need or have a resolution, then show them. */
	private loadMatches(): void {
		const run = this.run()
		if (!run) return
		this.matchesLoading.set(true)
		forkJoin([
			this.api.rows(run.id, { status: 'Valid', matchStatus: 'Unique' }),
			this.api.rows(run.id, { status: 'Valid', matchStatus: 'Ambiguous' }),
		])
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the rows. */ ([unique, ambiguous]) => {
					this.matches.set(
						[...unique.items, ...ambiguous.items].sort(
							/** Source order. */ (a, b) => a.rowNumber - b.rowNumber,
						),
					)
					this.matchesLoading.set(false)
					this.go('matches')
				},
				error: /** Explain. */ (error) => {
					this.matchesLoading.set(false)
					this.draft.error.set(importErrorMessage(error))
				},
			})
	}

	/** Move to commit only once the server reports no unresolved row. */
	private confirmMatches(): void {
		const run = this.run()
		if (!run) return
		this.send(
			this.api.readRun(run.id),
			/** Current counts. */ (current) => {
				this.run.set(current)
				if (current.unresolvedRowCount === 0) this.go('commit')
				else
					this.draft.error.set(
						`${current.unresolvedRowCount} matched rows still need a resolution.`,
					)
			},
		)
	}

	/** A row was resolved: refresh it in place and re-read the counts. */
	resolved(result: { row: ImportRowDto }): void {
		this.resolving.set(null)
		this.matches.update(
			/** Replace the row. */ (rows) =>
				rows.map(/** Same row. */ (row) => (row.id === result.row.id ? result.row : row)),
		)
		const run = this.run()
		if (run)
			this.api
				.readRun(run.id)
				.pipe(takeUntilDestroyed(this.destroy))
				.subscribe({
					next: /** Current counts. */ (current) => this.run.set(current),
					error: /** Explain. */ (error) => this.draft.error.set(importErrorMessage(error)),
				})
	}

	/** Open the resolution dialog for a row. */
	resolve(row: ImportRowDto): void {
		const run = this.run()
		if (run) this.resolving.set({ runId: run.id, row })
	}

	/** A row's resolution text. */
	resolutionText(row: ImportRowDto): string {
		if (!row.resolution) return 'Needed'
		const worker = row.candidates.find(
			/** Chosen. */ (item) => item.workerId === row.resolutionWorkerId,
		)
		return worker
			? `${this.resolutionLabels[row.resolution]}: ${worker.name}`
			: this.resolutionLabels[row.resolution]
	}

	/** Commit the run and open it. */
	finish(): void {
		const run = this.run()
		if (!run || this.draft.saving()) return
		const body = { expectedRevision: run.revision }
		this.send(
			this.api.command(run.id, 'commit', body, this.draft.key({ commit: run.id, body })),
			/** Done. */ (done) => {
				this.run.set(done)
				this.allowLeave = true
				void this.router.navigateByUrl(`${BASE_ROUTE}/runs/${encodeURIComponent(done.id)}`)
			},
		)
	}

	/** Send one command with the saving state and a retained retry key. */
	private send<T>(request: Observable<T>, done: (result: T) => void): void {
		this.draft.saving.set(true)
		this.draft.error.set('')
		request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Continue. */ (result) => {
				this.draft.saving.set(false)
				this.draft.markClean()
				done(result)
			},
			error: /** Preserve the step and retry key. */ (error) => {
				this.draft.saving.set(false)
				this.draft.error.set(importErrorMessage(error))
			},
		})
	}

	/** Show a step and extend the reachable range. */
	private go(step: Step): void {
		this.current.set(step)
		if (STEPS.indexOf(step) > STEPS.indexOf(this.reachable())) this.reachable.set(step)
	}

	/** Move to an earlier or reachable step. */
	stepChange(step: string): void {
		this.current.set(step as Step)
	}

	/** Leave the wizard; an uploaded run stays in the list until it is cancelled. */
	cancel(): void {
		const run = this.run()
		void this.router.navigateByUrl(
			run ? `${BASE_ROUTE}/runs/${encodeURIComponent(run.id)}` : BASE_ROUTE,
		)
	}

	/** Allow the route guard to consult this draft and any open dialog. */
	async canLeave(): Promise<boolean> {
		if (this.allowLeave) return true
		const dialog = this.resolveEditor()
		if (dialog && !(await dialog.canLeave())) return false
		// Once the run exists every step is saved on the server; only an unsent choice is a draft.
		return this.run() ? !this.draft.saving() : this.draft.canLeave()
	}

	/** Release a pending navigation decision. */
	ngOnDestroy(): void {
		this.draft.release()
	}
}
