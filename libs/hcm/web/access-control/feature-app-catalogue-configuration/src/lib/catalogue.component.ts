import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { TableRowActionNavigation } from '@fundamental-ngx/ui5-webcomponents/table-row-action-navigation'
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	Injector,
	afterNextRender,
	computed,
	effect,
	inject,
	signal,
	untracked,
} from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { form, FormField } from '@angular/forms/signals'
import { Subscription } from 'rxjs'
import getActiveElement from '@ui5/webcomponents-base/dist/util/getActiveElement.js'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	CatalogueApi,
	assignmentErrorMessage,
} from '@empflowyee/hcm-web-access-control-data-access'
import type {
	CatalogueEntry,
	CatalogueAccount,
	CatalogueDiscovery,
} from '@empflowyee/hcm-access-control-contract'
import { FlexibleColumnLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { CatalogueDetailComponent } from './catalogue-detail.component'
@Component({
	selector: 'ef-hcm-catalogue-configuration',
	imports: [
		Text,
		TableRowActionNavigation,
		HcmDynamicPage,
		FlexibleColumnLayout,
		Form,
		FormItem,
		Label,
		Input,
		Select,
		Option,
		Button,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		MessageStrip,
		FormField,
		CatalogueDetailComponent,
	],
	templateUrl: './catalogue.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogueConfigurationComponent {
	private readonly api = inject(CatalogueApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly route = inject(ActivatedRoute)
	private readonly router = inject(Router)
	private readonly destroy = inject(DestroyRef)
	private readonly injector = inject(Injector)
	private origin: HTMLElement | null = null
	private discoveryRequest?: Subscription
	private catalogueRequest?: Subscription
	private accountRequest?: Subscription
	readonly params = toSignal(this.route.queryParamMap, {
		initialValue: this.route.snapshot.queryParamMap,
	})
	readonly selectedId = computed(
		/** Keep app details deep-linkable independently of account inspection. */ () =>
			this.params().get('app'),
	)
	readonly entries = signal<CatalogueEntry[]>([])
	readonly state = signal<HcmPageState>('loading')
	readonly error = signal('')
	readonly filters = signal({ q: '', domain: '', status: '', entitled: '', sort: 'title' })
	readonly filterForm = form(this.filters)
	readonly domains = computed(
		/** Derive filter choices from the server-returned canonical metadata. */ () =>
			[
				...new Set(this.entries().map(/** Select a stable domain label. */ (app) => app.domain)),
			].sort(),
	)
	readonly statuses = computed(
		/** Preserve all canonical implementation states. */ () =>
			[
				...new Set(
					this.entries().map(
						/** Read the canonical status without fabricating readiness. */ (app) => app.status,
					),
				),
			].sort(),
	)
	readonly rows = computed(
		/** Only this explicitly bounded catalogue collection is filtered client-side. */ () => {
			const f = this.filters(),
				q = f.q.trim().toLowerCase()
			return this.entries()
				.filter(
					/** Apply declared read-only metadata filters. */ (app) =>
						(!q || `${app.title} ${app.appCode} ${app.domain}`.toLowerCase().includes(q)) &&
						(!f.domain || app.domain === f.domain) &&
						(!f.status || app.status === f.status) &&
						(!f.entitled || String(app.entitled) === f.entitled),
				)
				.sort(
					/** Keep selected canonical field and app code as deterministic tie breakers. */ (a, b) =>
						(f.sort === 'appCode'
							? a.appCode.localeCompare(b.appCode)
							: a.title.localeCompare(b.title)) || a.appCode.localeCompare(b.appCode),
				)
		},
	)
	readonly selected = computed(
		/** Resolve the selected metadata from the authorized collection. */ () =>
			this.entries().find(
				/** Locate only canonical app identity. */ (app) => app.appCode === this.selectedId(),
			) ?? null,
	)
	readonly accountFilter = signal({ q: '', id: '' })
	readonly accountForm = form(this.accountFilter)
	readonly subjectId = computed(
		/** Re-query only when the chosen subject changes, not while editing its search text. */ () =>
			this.accountFilter().id,
	)
	readonly accounts = signal<CatalogueAccount[]>([])
	readonly accountCursor = signal<string | null>(null)
	readonly accountBusy = signal(false)
	readonly accountError = signal('')
	private accountQuery = ''
	readonly explanation = signal<CatalogueDiscovery | null>(null)
	readonly explanationBusy = signal(false)
	readonly explanationError = signal('')
	readonly selectedExplanation = computed(
		/** Join a subject-specific explanation to the current app without changing actor context. */ () =>
			this.explanation()?.items.find(
				/** Resolve the selected app result. */ (item) => item.appCode === this.selectedId(),
			) ?? null,
	)
	readonly subject = computed(
		/** Present only the chosen account label from the bounded picker. */ () =>
			this.accounts().find(
				/** Match an opaque subject ID. */ (account) => account.id === this.accountFilter().id,
			)?.displayName ?? '',
	)
	/** Reset all prior-context projections before loading a verified tenant catalogue. */
	constructor() {
		effect(
			/** React only to authenticated context replacement. */ () => {
				this.runtime.context()
				untracked(
					/** The runtime interceptor separately owns request-context effects. */ () => {
						this.accountRequest?.unsubscribe()
						this.accountBusy.set(false)
						this.accountFilter.set({ q: '', id: '' })
						this.explanation.set(null)
						this.load()
						this.loadAccounts()
					},
				)
			},
		)
		effect(
			/** A selected subject is a query input, never a persona change. */ () => {
				const id = this.subjectId()
				untracked(
					/** Cancel obsolete subject responses before issuing the next request. */ () =>
						this.explain(id),
				)
			},
		)
	}
	/** Retrieve real catalogue and tenant entitlement state; transport failures remain visible. */
	load(): void {
		this.catalogueRequest?.unsubscribe()
		this.state.set('loading')
		this.error.set('')
		this.entries.set([])
		this.catalogueRequest = this.api
			.list()
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the server projection only after a successful read. */ (value) => {
					this.entries.set(value.items)
					this.state.set('content')
				},
				error: /** Do not substitute metadata fixtures for denied or unavailable tenant data. */ (
					error,
				) => {
					this.error.set(assignmentErrorMessage(error))
					this.state.set('error')
				},
			})
	}
	/** Search or grow a bounded account picker independently of the public app inventory. */
	loadAccounts(more = false): void {
		if (this.accountBusy()) return
		if (!more) {
			this.accountQuery = this.accountFilter().q
			this.accounts.set([])
			this.accountCursor.set(null)
			this.accountFilter.update(
				/** Clear an obsolete subject choice when changing account search. */ (value) => ({
					...value,
					id: '',
				}),
			)
		}
		this.accountBusy.set(true)
		this.accountError.set('')
		this.accountRequest = this.api
			.accounts(this.accountQuery, more ? (this.accountCursor() ?? undefined) : undefined)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Preserve earlier options only for explicit growing. */ (page) => {
					this.accounts.update(
						/** Append the next bounded page. */ (rows) =>
							more ? [...rows, ...page.items] : page.items,
					)
					this.accountCursor.set(page.nextCursor)
					this.accountBusy.set(false)
				},
				error: /** A failed account search is distinct from no matching people. */ (error) => {
					this.accountError.set(assignmentErrorMessage(error))
					this.accountBusy.set(false)
				},
			})
	}
	/** Resolve discovery reasons from real server grants, cancelling a previous subject selection. */
	explain(id = this.accountFilter().id): void {
		this.discoveryRequest?.unsubscribe()
		this.explanation.set(null)
		this.explanationError.set('')
		this.explanationBusy.set(false)
		if (!id) return
		this.explanationBusy.set(true)
		this.discoveryRequest = this.api
			.discovery(id)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish only the current selected subject response. */ (value) => {
					this.explanation.set(value)
					this.explanationBusy.set(false)
				},
				error: /** Preserve the selected subject and offer an explicit retry. */ (error) => {
					this.explanationError.set(assignmentErrorMessage(error))
					this.explanationBusy.set(false)
				},
			})
	}
	/** Retain list filters while routing a selected app to native details. */
	select(id: string): void {
		this.origin = getActiveElement() as HTMLElement | null
		void this.router.navigate([], { relativeTo: this.route, queryParams: { app: id } })
	}
	/** Close the mid column and restore keyboard focus to its list trigger. */
	async close(): Promise<void> {
		await this.router.navigate([], { relativeTo: this.route, queryParams: {} })
		afterNextRender(
			/** Wait for the native column update. */ () =>
				requestAnimationFrame(
					/** Do not focus a destroyed route. */ () => {
						if (!this.destroy.destroyed && this.origin?.isConnected) this.origin.focus()
					},
				),
			{ injector: this.injector },
		)
	}

	/** Open the same object from native pointer or keyboard row activation. */
	openRow(key: string | undefined): void {
		const app = this.rows().find(
			/** Match the native row identity to the current server projection. */ (item) =>
				item.appCode === key,
		)
		if (app) void this.select(app.appCode)
	}
}
