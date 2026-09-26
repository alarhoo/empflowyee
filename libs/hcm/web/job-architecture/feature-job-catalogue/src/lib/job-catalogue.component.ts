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
import { filter, map, of, switchMap, type Subscription } from 'rxjs'
import { form, FormField } from '@angular/forms/signals'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { FlexibleColumnLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
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
	JobCatalogueApi,
	jobArchitectureDenied,
	jobArchitectureErrorMessage,
} from '@empflowyee/hcm-web-job-architecture-data-access'
import {
	ARCHITECTURE_STATUSES,
	type ArchitectureStatus,
	type CatalogueSummaryDto,
	type JobFamilyNodeDto,
	type JobProfileSummaryDto,
} from '@empflowyee/hcm-job-architecture-contract'
import { BASE_ROUTE, MANAGE_PERMISSION, PUBLISH_PERMISSION, versionStatus } from './labels'
import { familyTree, flatFamilies } from './families'
import { CatalogueVersionComponent, type VersionCommand } from './catalogue-version.component'
import { ProfileVersionComponent } from './profile-version.component'
import { ElementDialog, type ElementDialogRequest } from './element-dialog.component'
import {
	LifecycleDialog,
	type LifecycleRequest,
	type LifecycleResult,
} from './lifecycle-dialog.component'

type Selection = { type: 'versions' | 'profiles'; id: string } | null

/** Job Catalogue: native FCL of catalogue versions or job profiles and the selected version. */
@Component({
	selector: 'ef-hcm-job-catalogue',
	imports: [
		FormField,
		ObjectStatusComponent,
		FlexibleColumnLayout,
		Form,
		FormItem,
		Label,
		Input,
		Select,
		Option,
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
		CatalogueVersionComponent,
		ProfileVersionComponent,
		ElementDialog,
		LifecycleDialog,
	],
	templateUrl: './job-catalogue.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobCatalogueComponent {
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(JobCatalogueApi)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	private profileRequest?: Subscription
	readonly statuses = ARCHITECTURE_STATUSES
	readonly status = versionStatus
	readonly selected = toSignal(
		this.router.events.pipe(
			filter(/** Completed navigations only. */ (event) => event instanceof NavigationEnd),
			map(/** Read the child segment. */ () => this.childSelection()),
		),
		{ initialValue: this.childSelection() },
	)
	readonly scope = signal<'catalogue' | 'profiles'>(
		this.childSelection()?.type === 'profiles' ? 'profiles' : 'catalogue',
	)
	readonly catalogue = signal<CatalogueSummaryDto | null>(null)
	readonly families = signal<JobFamilyNodeDto[]>([])
	readonly profiles = signal<JobProfileSummaryDto[]>([])
	readonly cursor = signal<string | null>(null)
	readonly filters = signal({ q: '', status: 'all', familyId: 'all' })
	readonly filterForm = form(this.filters)
	readonly state = signal<HcmPageState>('loading')
	readonly profileState = signal<'loading' | 'content' | 'error'>('loading')
	readonly message = signal('')
	readonly notice = signal('')
	readonly refresh = signal(0)
	readonly elementDialog = signal<ElementDialogRequest | null>(null)
	readonly lifecycleDialog = signal<LifecycleRequest | null>(null)
	private readonly elementEditor = viewChild(ElementDialog)
	private readonly lifecycleEditor = viewChild(LifecycleDialog)
	readonly canManage = computed(
		/** Presentation only; every endpoint re-authorizes on the server. */ () =>
			this.runtime.context()?.access.permissions.includes(MANAGE_PERMISSION) === true,
	)
	readonly canPublish = computed(
		/** Presentation only; every endpoint re-authorizes on the server. */ () =>
			this.runtime.context()?.access.permissions.includes(PUBLISH_PERMISSION) === true,
	)
	readonly openDraft = computed(
		/** Whether a draft or review version exists. */ () =>
			(this.catalogue()?.versions ?? []).some(
				/** Open version. */ (v) => v.status === 'Draft' || v.status === 'InReview',
			),
	)
	readonly actions = computed(
		/** New job profiles are created on their dedicated route. */ () =>
			this.scope() === 'profiles'
				? [{ id: 'create', label: 'New job profile', mutates: true, emphasized: true }]
				: [],
	)
	readonly layout = computed(
		/** Show the detail column only for a selection. */ () =>
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
						this.profileRequest?.unsubscribe()
						this.catalogue.set(null)
						this.profiles.set([])
						this.elementDialog.set(null)
						this.lifecycleDialog.set(null)
						if (context) this.load()
					},
				)
			},
		)
		this.destroy.onDestroy(
			/** Cancel in-flight reads. */ () => {
				this.request?.unsubscribe()
				this.profileRequest?.unsubscribe()
			},
		)
	}

	/** The selected version from the child route segment. */
	private childSelection(): Selection {
		const child = this.route.snapshot.firstChild
		const id = child?.paramMap.get('versionId')
		const type = child?.routeConfig?.path?.startsWith('profiles') ? 'profiles' : 'versions'
		return id ? { type, id } : null
	}

	/** Load the catalogue with the current version's families, then the first profile page. */
	load(quiet = false): void {
		if (!quiet) this.state.set('loading')
		this.message.set('')
		this.request?.unsubscribe()
		this.request = this.api
			.catalogues()
			.pipe(
				switchMap(
					/** Families of the current version feed the profile family filter. */ (result) => {
						const catalogue = result.items[0] ?? null
						const current = catalogue?.currentVersionId
						if (!current) return of({ catalogue, families: [] as JobFamilyNodeDto[] })
						return familyTree(this.api, current).pipe(
							map(/** Flat family list. */ (tree) => ({ catalogue, families: flatFamilies(tree) })),
						)
					},
				),
				takeUntilDestroyed(this.destroy),
			)
			.subscribe({
				next: /** Publish the catalogue. */ ({ catalogue, families }) => {
					this.catalogue.set(catalogue)
					this.families.set(families)
					this.state.set('content')
					this.loadProfiles(false)
				},
				error: /** Distinguish denial from temporary failure. */ (error) => {
					this.message.set(jobArchitectureErrorMessage(error))
					this.state.set(jobArchitectureDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Load a page of job profiles for the applied filters; growing appends. */
	loadProfiles(append: boolean): void {
		const f = this.filters()
		this.profileRequest?.unsubscribe()
		if (!append) this.profileState.set('loading')
		this.profileRequest = this.api
			.profiles({
				q: f.q.trim(),
				...(f.status !== 'all' ? { status: f.status as ArchitectureStatus } : {}),
				...(f.familyId !== 'all' ? { familyId: f.familyId } : {}),
				...(append && this.cursor() ? { cursor: this.cursor() ?? undefined } : {}),
			})
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the page. */ (page) => {
					this.profiles.update(
						/** Append on growing. */ (rows) => (append ? [...rows, ...page.items] : page.items),
					)
					this.cursor.set(page.nextCursor)
					this.profileState.set('content')
				},
				error: /** Keep the page usable with a truthful message. */ (error) => {
					this.message.set(jobArchitectureErrorMessage(error))
					this.profileState.set('error')
				},
			})
	}

	/** Family filter label with its parent context. */
	familyLabel(family: JobFamilyNodeDto): string {
		return family.depth > 1 ? `— ${family.name}` : family.name
	}

	/** Switch between catalogue versions and job profiles. */
	chooseScope(item: HTMLElement | undefined): void {
		const scope = item?.dataset['scope']
		if (scope === 'catalogue' || scope === 'profiles') this.scope.set(scope)
	}

	/** Open a catalogue or profile version in the mid column. */
	open(type: 'versions' | 'profiles', id: string | undefined): void {
		if (id) void this.router.navigateByUrl(`${BASE_ROUTE}/${type}/${encodeURIComponent(id)}`)
	}

	/** Close the mid column. */
	close(): void {
		void this.router.navigateByUrl(BASE_ROUTE)
	}

	/** Route list actions. */
	action(id: string): void {
		if (id === 'create' && this.canManage())
			void this.router.navigateByUrl(`${BASE_ROUTE}/profiles/new`)
	}

	/** Open a profile draft on its dedicated editing route. */
	edit(id: string): void {
		void this.router.navigateByUrl(`${BASE_ROUTE}/profiles/${encodeURIComponent(id)}/edit`)
	}

	/** Route a version command to its Dialog. */
	command(command: VersionCommand): void {
		this.notice.set('')
		if (command.kind === 'element') this.elementDialog.set(command.request)
		else this.lifecycleDialog.set(command.request)
	}

	/** Route a profile lifecycle command to its Dialog. */
	profileCommand(request: LifecycleRequest): void {
		this.notice.set('')
		this.lifecycleDialog.set(request)
	}

	/** Refresh after an element change. */
	elementSaved(): void {
		this.elementDialog.set(null)
		this.notice.set('Catalogue version saved.')
		this.refresh.update(/** Invalidate the detail. */ (count) => count + 1)
	}

	/** Refresh after a lifecycle step and show the resulting version. */
	lifecycleSaved(result: LifecycleResult): void {
		const request = this.lifecycleDialog()
		this.lifecycleDialog.set(null)
		const type = request?.target.type === 'profile' ? 'profiles' : 'versions'
		const verb = { 'new-draft': 'created', submit: 'submitted', publish: 'published' }[
			request?.mode ?? 'submit'
		]
		this.notice.set(`Version ${result.versionNumber} ${verb}.`)
		this.refresh.update(/** Invalidate the detail. */ (count) => count + 1)
		this.load(true)
		this.open(type, result.id)
	}

	/** Consult any open draft before leaving the feature. */
	canLeave(): Promise<boolean> {
		const editor = this.elementEditor() ?? this.lifecycleEditor()
		return editor?.canLeave() ?? Promise.resolve(true)
	}
}
