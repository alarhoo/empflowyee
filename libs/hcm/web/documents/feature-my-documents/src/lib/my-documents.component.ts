import { TableRowActionNavigation } from '@fundamental-ngx/ui5-webcomponents/table-row-action-navigation'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import getActiveElement from '@ui5/webcomponents-base/dist/util/getActiveElement.js'
import { ActivatedRoute, Router } from '@angular/router'
import { toSignal } from '@angular/core/rxjs-interop'
import { FlexibleColumnLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { HttpErrorResponse } from '@angular/common/http'
import { form, FormField } from '@angular/forms/signals'
import type { Subscription } from 'rxjs'
import { MyDocumentsApi, documentErrorMessage } from '@empflowyee/hcm-web-documents-data-access'
import {
	parseTemplateQuery,
	type SelfDocument,
	type DocumentVersion,
	type TemplateQuery,
} from '@empflowyee/hcm-documents-contract'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
@Component({
	selector: 'ef-hcm-my-documents',
	imports: [
		TableRowActionNavigation,
		Text,
		HcmDynamicPage,
		FlexibleColumnLayout,
		HcmObjectPage,
		HcmObjectSection,
		Form,
		FormItem,
		Input,
		Label,
		Select,
		Option,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		Button,
		MessageStrip,
		FormField,
	],
	templateUrl: 'my-documents.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyDocumentsComponent {
	private readonly api = inject(MyDocumentsApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	private detailRequest?: Subscription
	private versionRequest?: Subscription
	private downloadRequest?: Subscription
	private readonly injector = inject(Injector)
	private focusOrigin: HTMLElement | null = null
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	readonly query = toSignal(this.route.queryParamMap, {
		initialValue: this.route.snapshot.queryParamMap,
	})
	readonly selectedId = computed(
		/** Keep selected objects deep-linkable. */ () => this.query().get('document'),
	)
	readonly detailState = signal<HcmPageState>('loading')
	readonly detailMessage = signal('')
	readonly versions = signal<DocumentVersion[]>([])
	readonly versionCursor = signal<string | null>(null)
	readonly versionBusy = signal(false)
	readonly versionMessage = signal('')
	readonly downloading = signal<string | null>(null)
	readonly canDownload = computed(
		/** Reflect the independent download capability. */ () =>
			this.runtime.context()?.access.permissions.includes('hcm.documents.self.download') === true,
	)
	readonly detailActions = [{ id: 'back', label: 'Back to documents' }]

	private applied: TemplateQuery = { q: '', sort: 'label:asc', limit: 25 }
	readonly filters = signal({ q: '', typeId: '', sort: 'label:asc' })
	readonly fields = form(this.filters)
	readonly rows = signal<SelfDocument[]>([])
	readonly cursor = signal<string | null>(null)
	readonly state = signal<HcmPageState>('loading')
	readonly busy = signal(false)
	readonly message = signal('')
	readonly selected = signal<SelfDocument | null>(null)
	readonly canRead = computed(
		/** Entry visibility is separate from document-content authority. */ () =>
			this.runtime.context()?.access.permissions.includes('hcm.documents.self.read') === true,
	)
	/** Clear old-context projections and drafts when verified runtime context changes. */
	constructor() {
		effect(
			/** Track context replacement only. */ () => {
				this.runtime.context()
				untracked(
					/** Reset caller-specific state without subscribing the effect to drafts. */ () => {
						this.selected.set(null)
						this.downloadRequest?.unsubscribe()
						this.downloading.set(null)
						this.fields().reset({ q: '', typeId: '', sort: 'label:asc' })
						this.load()
					},
				)
			},
		)
		effect(
			/** Reload selected details after route or context changes. */ () => {
				this.selectedId()
				this.runtime.context()
				untracked(
					/** Exclude response signals from request dependencies. */ () => this.loadDetail(),
				)
			},
		)
	}

	/** Apply strict server query controls, resetting cursors when filters change. */
	load(): void {
		this.request?.unsubscribe()
		this.rows.set([])
		this.cursor.set(null)
		this.message.set('')
		if (!this.canRead()) {
			this.state.set('denied')
			this.busy.set(false)
			return
		}
		try {
			const value = this.filters(),
				params = new URLSearchParams({ q: value.q, sort: value.sort, limit: '25' })
			if (value.typeId) params.set('typeId', value.typeId)
			this.applied = parseTemplateQuery(params)
		} catch {
			this.message.set('Check the selected filters.')
			this.state.set('error')
			return
		}
		this.state.set('loading')
		this.fetch(false)
	}
	/** Grow a current server result without changing its filter binding. */
	more(): void {
		if (this.cursor() && !this.busy()) this.fetch(true)
	}
	/** Load one bounded real API page and cancel obsolete queries on context replacement. */
	private fetch(append: boolean): void {
		this.busy.set(true)
		this.message.set('')
		this.request = this.api
			.list({
				...this.applied,
				...(append && this.cursor() ? { cursor: this.cursor() ?? undefined } : {}),
			})
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish only the authorized page response. */ (page) => {
					this.rows.update(
						/** Preserve existing pages only for explicit growing. */ (rows) =>
							append ? [...rows, ...page.items] : page.items,
					)
					this.cursor.set(page.nextCursor)
					this.state.set('content')
					this.busy.set(false)
				},
				error: /** Preserve denied versus transport-failure state. */ (error) => {
					this.message.set(documentErrorMessage(error))
					this.busy.set(false)
					this.state.set(
						error instanceof HttpErrorResponse && [401, 403].includes(error.status)
							? 'denied'
							: 'error',
					)
				},
			})
	}

	/** Open a self-scoped self document deep link in the native mid column. */
	async select(id: string): Promise<void> {
		this.focusOrigin = getActiveElement() as HTMLElement | null
		await this.router.navigate([], { relativeTo: this.route, queryParams: { document: id } })
	}
	/** Close detail or open the bounded upload action against its exact revision. */
	async detailAction(): Promise<void> {
		await this.router.navigate([], { relativeTo: this.route, queryParams: {} })
		afterNextRender(
			/** Restore the retained list action after closing detail. */ () => {
				if (this.focusOrigin?.isConnected) this.focusOrigin.focus()
			},
			{ injector: this.injector },
		)
	}
	/** Resolve selected metadata without scanning all list pages or reusing old-context rows. */
	loadDetail(): void {
		this.detailRequest?.unsubscribe()
		this.versionRequest?.unsubscribe()
		this.selected.set(null)
		this.versions.set([])
		this.versionCursor.set(null)
		this.detailMessage.set('')
		this.versionMessage.set('')
		const id = this.selectedId()
		if (!id) return
		if (!this.canRead()) {
			this.detailState.set('denied')
			return
		}
		this.detailState.set('loading')
		this.detailRequest = this.api
			.get(id)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish only the authorized selected object. */ (item) => {
					this.selected.set(item)
					this.detailState.set('content')
					this.loadVersions()
				},
				error: /** Keep denied, unavailable and transient detail failures distinct. */ (error) => {
					this.detailMessage.set(documentErrorMessage(error))
					let state: HcmPageState = 'error'
					if (error instanceof HttpErrorResponse) {
						if (error.status === 404) state = 'unavailable'
						if ([401, 403].includes(error.status)) state = 'denied'
					}
					this.detailState.set(state)
				},
			})
	}
	/** Read the immutable version collection with explicit server pagination. */
	loadVersions(append = false): void {
		const id = this.selectedId()
		if (!id) return
		this.versionRequest?.unsubscribe()
		this.versionBusy.set(true)
		this.versionMessage.set('')
		if (!append) {
			this.versions.set([])
			this.versionCursor.set(null)
		}
		this.versionRequest = this.api
			.versions(id, append ? (this.versionCursor() ?? undefined) : undefined)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Keep only the current selected object's committed versions. */ (result) => {
					this.versions.update(
						/** Append only when requested by native growing. */ (rows) =>
							append ? [...rows, ...result.items] : result.items,
					)
					this.versionCursor.set(result.nextCursor)
					this.versionBusy.set(false)
				},
				error: /** Retain usable rows while reporting a child collection failure. */ (error) => {
					this.versionMessage.set(documentErrorMessage(error))
					this.versionBusy.set(false)
				},
			})
	}
	/** Download through the real API and revoke its temporary browser URL after saving. */
	download(version: DocumentVersion): void {
		const id = this.selectedId()
		if (!id || this.downloading() || !this.canDownload()) return
		this.downloading.set(version.id)
		this.versionMessage.set('')
		this.downloadRequest = this.api
			.download(id, version)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Deliver attachment bytes without inline preview or persistent public URLs. */ (
					blob,
				) => {
					const url = URL.createObjectURL(blob),
						link = document.createElement('a')
					link.href = url
					link.download = version.filename
					link.click()
					setTimeout(
						/** Release the temporary object URL after the browser starts saving. */ () =>
							URL.revokeObjectURL(url),
						1000,
					)
					this.downloading.set(null)
				},
				error: /** A missing or unauthorized file never produces an empty fake attachment. */ (
					error,
				) => {
					this.versionMessage.set(documentErrorMessage(error))
					this.downloading.set(null)
				},
			})
	}

	/** Open the same object from native pointer or keyboard row activation. */
	openRow(key: string | undefined): void {
		const item = this.rows().find(
			/** Match the native row identity to the current server projection. */ (item) =>
				item.id === key,
		)
		if (item) void this.select(item.id)
	}
}
