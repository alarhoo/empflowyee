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
import { FlexibleColumnLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout'
import { List } from '@fundamental-ngx/ui5-webcomponents/list'
import { ListItemGroup } from '@fundamental-ngx/ui5-webcomponents/list-item-group'
import { ListItemStandard } from '@fundamental-ngx/ui5-webcomponents/list-item-standard'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	LookupValuesApi,
	lookupErrorMessage,
	structureDenied,
} from '@empflowyee/hcm-web-workforce-foundation-data-access'
import type { LookupSetDto, LookupValueDto } from '@empflowyee/hcm-workforce-foundation-contract'
import { LookupSetComponent } from './lookup-set.component'
import { LookupValueDialog, type ValueDialogRequest } from './value-dialog.component'
import { LookupActiveDialog } from './active-dialog.component'
import { MANAGE_PERMISSION } from './lookup-columns'

/** Lookup Values: native FCL of the eight lookup sets and one set's values. */
@Component({
	selector: 'ef-hcm-lookup-values',
	imports: [
		FlexibleColumnLayout,
		List,
		ListItemGroup,
		ListItemStandard,
		MessageStrip,
		HcmDynamicPage,
		LookupSetComponent,
		LookupValueDialog,
		LookupActiveDialog,
	],
	templateUrl: './lookup-values.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LookupValuesComponent {
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(LookupValuesApi)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	readonly setKey = toSignal(
		this.router.events.pipe(
			filter(/** Completed navigations only. */ (event) => event instanceof NavigationEnd),
			map(/** Read the child segment. */ () => this.childKey()),
		),
		{ initialValue: this.childKey() },
	)
	readonly sets = signal<LookupSetDto[]>([])
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly groups = computed(
		/** Group the bounded collection by ownership, tenant lists first. */ () =>
			(['Tenant', 'Product'] as const).map(
				/** One ownership group. */ (ownership) => ({
					ownership,
					label: ownership === 'Tenant' ? 'Organisation lists' : 'Product lists',
					items: this.sets().filter(/** Same ownership. */ (set) => set.ownership === ownership),
				}),
			),
	)
	readonly selected = computed(
		/** The routed set, once the collection is known. */ () =>
			this.sets().find(/** Match the route key. */ (set) => set.key === this.setKey()) ?? null,
	)
	readonly unknown = computed(
		/** A deep link to a set that does not exist. */ () =>
			this.state() === 'content' && this.setKey() !== null && this.selected() === null,
	)
	readonly fullScreen = signal(false)
	readonly layout = computed(
		/** Show only the columns the selection needs. */ () => {
			if (!this.selected()) return 'OneColumn'
			return this.fullScreen() ? 'MidColumnFullScreen' : 'TwoColumnsMidExpanded'
		},
	)
	readonly canManage = computed(
		/** Presentation only; every endpoint re-authorizes on the server. */ () =>
			this.runtime.context()?.access.permissions.includes(MANAGE_PERMISSION) === true,
	)
	readonly refresh = signal(0)
	readonly notice = signal('')
	readonly valueDialog = signal<ValueDialogRequest | null>(null)
	readonly activeDialog = signal<{ set: LookupSetDto; value: LookupValueDto } | null>(null)
	private readonly valueEditor = viewChild(LookupValueDialog)
	private readonly activeEditor = viewChild(LookupActiveDialog)

	/** Reload the sets when the verified context changes. */
	constructor() {
		effect(
			/** Track the context that defines the collection. */ () => {
				const context = this.runtime.context()
				untracked(
					/** Clear prior-context state before loading. */ () => {
						this.request?.unsubscribe()
						this.sets.set([])
						if (context) this.load()
					},
				)
			},
		)
		this.destroy.onDestroy(/** Cancel in-flight reads. */ () => this.request?.unsubscribe())
	}

	/** Read the set key from the child route segment. */
	private childKey(): string | null {
		return this.route.snapshot.firstChild?.paramMap.get('setKey') ?? null
	}

	/** Load the eight sets with their counts; a quiet reload keeps the columns in place. */
	load(quiet = false): void {
		if (!quiet) this.state.set('loading')
		this.message.set('')
		this.request?.unsubscribe()
		this.request = this.api
			.sets()
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the bounded collection. */ (result) => {
					this.sets.set(result.items)
					this.state.set('content')
				},
				error: /** Distinguish denial from temporary failure. */ (error) => {
					this.message.set(lookupErrorMessage(error))
					this.state.set(structureDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Open a set from the begin column. */
	choose(item: HTMLElement | null): void {
		const key = item?.dataset['set']
		if (key && key !== this.setKey()) {
			this.notice.set('')
			void this.router.navigate([key], { relativeTo: this.route })
		}
	}

	/** Close the mid column. */
	close(): void {
		this.fullScreen.set(false)
		void this.router.navigate(['.'], { relativeTo: this.route })
	}

	/** Open the create Dialog for a tenant set. */
	create(set: LookupSetDto): void {
		if (!this.canManage()) return
		this.notice.set('')
		this.valueDialog.set({ set, value: null })
	}

	/** Open the edit Dialog for a tenant value. */
	edit(set: LookupSetDto, value: LookupValueDto): void {
		if (!this.canManage()) return
		this.notice.set('')
		this.valueDialog.set({ set, value })
	}

	/** Open the retire or reactivate Dialog. */
	changeActive(set: LookupSetDto, value: LookupValueDto): void {
		if (!this.canManage()) return
		this.notice.set('')
		this.activeDialog.set({ set, value })
	}

	/** Refresh both columns after a confirmed command. */
	saved(value: LookupValueDto): void {
		this.valueDialog.set(null)
		this.activeDialog.set(null)
		this.notice.set(`${value.name} saved.`)
		this.refresh.update(/** Invalidate the loaded values. */ (count) => count + 1)
		this.load(true)
	}

	/** Consult any open draft before leaving the feature. */
	canLeave(): Promise<boolean> {
		const editor = this.valueEditor() ?? this.activeEditor()
		return editor?.canLeave() ?? Promise.resolve(true)
	}
}
