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
import { Toolbar } from '@fundamental-ngx/ui5-webcomponents/toolbar'
import { ToolbarButton } from '@fundamental-ngx/ui5-webcomponents/toolbar-button'
import { Tree } from '@fundamental-ngx/ui5-webcomponents/tree'
import { TreeItem } from '@fundamental-ngx/ui5-webcomponents/tree-item'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableRowAction } from '@fundamental-ngx/ui5-webcomponents/table-row-action'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import { HcmDatePipe } from '@empflowyee/hcm-web-runtime-context'
import {
	JobCatalogueApi,
	jobArchitectureDenied,
	jobArchitectureErrorMessage,
	jobArchitectureMissing,
} from '@empflowyee/hcm-web-job-architecture-data-access'
import {
	TRACK_KINDS,
	type CatalogueElementKind,
	type CatalogueVersionDto,
	type JobFamilyNodeDto,
	type JobGradeDto,
} from '@empflowyee/hcm-job-architecture-contract'
import type { ElementDialogRequest, ElementRow } from './element-dialog.component'
import type { LifecycleRequest } from './lifecycle-dialog.component'
import { TRACK_KIND_LABELS, versionStatus } from './labels'
import { familyTree } from './families'

export type VersionCommand =
	| { kind: 'element'; request: ElementDialogRequest }
	| { kind: 'lifecycle'; request: LifecycleRequest }

/** Mid column: one catalogue version with families, tracks and levels, bands and grades. */
@Component({
	selector: 'ef-hcm-job-catalogue-version',
	imports: [
		ObjectStatusComponent,
		Form,
		FormItem,
		Label,
		Text,
		Toolbar,
		ToolbarButton,
		Tree,
		TreeItem,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		TableRowAction,
		HcmObjectPage,
		HcmObjectSection,
		HcmDatePipe,
	],
	templateUrl: './catalogue-version.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogueVersionComponent {
	readonly versionId = input.required<string>()
	readonly refresh = input(0)
	readonly canManage = input(false)
	readonly canPublish = input(false)
	/** Whether the catalogue already has an open draft or review. */
	readonly openDraft = input(false)
	readonly commanded = output<VersionCommand>()
	readonly closed = output<void>()
	private readonly api = inject(JobCatalogueApi)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly status = versionStatus
	readonly trackKinds = TRACK_KIND_LABELS
	readonly trackKindCount = TRACK_KINDS.length
	readonly version = signal<CatalogueVersionDto | null>(null)
	readonly roots = signal<JobFamilyNodeDto[]>([])
	readonly children = signal<Record<string, JobFamilyNodeDto[]>>({})
	readonly state = signal<'content' | 'loading' | 'error' | 'denied'>('loading')
	readonly message = signal('')
	readonly editable = computed(
		/** Only drafts change, and only for managers. */ () =>
			this.canManage() && this.version()?.status === 'Draft',
	)
	readonly levels = computed(
		/** Levels of every track with their track name. */ () =>
			(this.version()?.tracks ?? []).flatMap(
				/** Track levels. */ (track) =>
					track.levels.map(/** Level row. */ (level) => ({ ...level, track: track.name })),
			),
	)
	readonly grades = computed(
		/** Grades of every band with their band name. */ () =>
			(this.version()?.bands ?? []).flatMap(
				/** Band grades. */ (band) =>
					band.grades.map(/** Grade row. */ (grade) => ({ ...grade, band: band.name })),
			),
	)
	readonly actions = computed(
		/** Lifecycle actions allowed for the viewer and the version status. */ () => {
			const version = this.version()
			const actions: { id: string; label: string; mutates?: boolean; emphasized?: boolean }[] = []
			if (
				version?.status === 'Published' &&
				version.current &&
				this.canManage() &&
				!this.openDraft()
			)
				actions.push({ id: 'new-draft', label: 'Create draft', mutates: true, emphasized: true })
			if (version?.status === 'Draft' && this.canManage())
				actions.push({ id: 'submit', label: 'Submit for review', mutates: true, emphasized: true })
			if (version?.status === 'InReview' && this.canPublish())
				actions.push({ id: 'publish', label: 'Publish', mutates: true, emphasized: true })
			actions.push({ id: 'close', label: 'Close' })
			return actions
		},
	)

	/** Reload when the version, a refresh or the inputs change. */
	constructor() {
		effect(
			/** Track the inputs that define the visible data. */ () => {
				this.versionId()
				this.refresh()
				untracked(/** Load outside the reactive context. */ () => this.load())
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.request?.unsubscribe())
	}

	/** Load the version, its root families and their children. */
	load(): void {
		this.request?.unsubscribe()
		if (!this.version()) this.state.set('loading')
		this.message.set('')
		const id = this.versionId()
		this.request = forkJoin([this.api.readVersion(id), familyTree(this.api, id)])
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the version. */ ([version, tree]) => {
					this.version.set(version)
					this.roots.set(tree.roots)
					this.children.set(tree.children)
					this.state.set('content')
				},
				error: /** Truthful failure without stale data. */ (error) => {
					this.version.set(null)
					this.message.set(
						jobArchitectureMissing(error)
							? 'This catalogue version is no longer available.'
							: jobArchitectureErrorMessage(error),
					)
					this.state.set(jobArchitectureDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Route Object Page actions. */
	action(id: string): void {
		const version = this.version()
		if (id === 'close') this.closed.emit()
		else if (version && (id === 'new-draft' || id === 'submit' || id === 'publish'))
			this.commanded.emit({
				kind: 'lifecycle',
				request: { mode: id, target: { type: 'catalogue', version } },
			})
	}

	/** Ask the shell to add or edit an element of the draft. */
	element(kind: CatalogueElementKind, element: ElementRow | null, parentId?: string): void {
		const version = this.version()
		if (!version || !this.editable()) return
		this.commanded.emit({
			kind: 'element',
			request: { version, kind, element, roots: this.roots(), ...(parentId ? { parentId } : {}) },
		})
	}

	/** Grade codes of a band. */
	gradeCodes(grades: JobGradeDto[]): string {
		return grades.map(/** Code. */ (grade) => grade.code).join(', ')
	}

	/** Edit the family behind a tree item. */
	editFamily(item: HTMLElement | undefined): void {
		const id = item?.dataset['id']
		const family = [...this.roots(), ...Object.values(this.children()).flat()].find(
			/** The clicked family. */ (f) => f.id === id,
		)
		if (family)
			this.element('families', {
				id: family.id,
				code: family.code,
				name: family.name,
				description: family.description,
				active: family.active,
				order: family.sortOrder,
			})
	}
}
