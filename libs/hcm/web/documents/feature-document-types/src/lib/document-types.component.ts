import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { HcmViewSettings } from '@empflowyee/hcm-web-ux-tables'
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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { HttpErrorResponse } from '@angular/common/http'
import { form, FormField } from '@angular/forms/signals'
import type { Subscription } from 'rxjs'
import { DocumentTypesApi, documentErrorMessage } from '@empflowyee/hcm-web-documents-data-access'
import {
	parseDocumentTypeQuery,
	type DocumentType,
	type DocumentTypeQuery,
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
import { DocumentTypeDialogComponent } from './document-type-dialog.component'
@Component({
	selector: 'ef-hcm-document-types',
	imports: [
		ObjectStatusComponent,
		HcmViewSettings,
		HcmDynamicPage,
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
		DocumentTypeDialogComponent,
	],
	templateUrl: 'document-types.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentTypesComponent {
	private readonly api = inject(DocumentTypesApi)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	private applied: DocumentTypeQuery = { q: '', sort: 'label:asc', limit: 25 }
	readonly filters = signal({ q: '', enabled: '', sort: 'label:asc' })
	readonly fields = form(this.filters)
	readonly rows = signal<DocumentType[]>([])
	readonly cursor = signal<string | null>(null)
	readonly state = signal<HcmPageState>('loading')
	readonly busy = signal(false)
	readonly message = signal('')
	readonly editing = signal(false)
	readonly selected = signal<DocumentType | null>(null)
	readonly dialog = viewChild(DocumentTypeDialogComponent)
	readonly canRead = computed(
		/** Entry visibility is separate from document-content authority. */ () =>
			this.runtime.context()?.access.permissions.includes('hcm.documents.types.read') === true,
	)
	readonly canManage = computed(
		/** Mirror persisted operation capabilities without authorizing writes in the browser. */ () =>
			this.runtime.context()?.access.permissions.includes('hcm.documents.types.manage') === true,
	)
	readonly actions = computed(
		/** Offer only the approved classification creation command. */ () =>
			this.canRead() && this.canManage()
				? [{ id: 'create', label: 'Create document type', mutates: true }]
				: [],
	)
	/** Clear old-context projections and drafts when verified runtime context changes. */
	constructor() {
		effect(
			/** Track context replacement only. */ () => {
				this.runtime.context()
				untracked(
					/** Reset caller-specific state without subscribing the effect to drafts. */ () => {
						this.editing.set(false)
						this.selected.set(null)
						this.fields().reset({ q: '', enabled: '', sort: 'label:asc' })
						this.load()
					},
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
			if (value.enabled) params.set('enabled', value.enabled)
			this.applied = parseDocumentTypeQuery(params)
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
	/** Open one bounded create or edit form against an exact persisted revision. */
	edit(item: DocumentType | null = null): void {
		if (this.canManage() && this.canRead()) {
			this.selected.set(item)
			this.editing.set(true)
		}
	}
	/** Reload server state after a committed change, retaining selected query controls. */
	changed(id: string | null): void {
		this.editing.set(false)
		this.selected.set(null)
		if (id) this.load()
	}
	/** Route all navigation and persona changes through focused-form draft protection. */
	canLeave(): Promise<boolean> {
		return this.dialog()?.canLeave() ?? Promise.resolve(true)
	}
	/** Apply confirmed table sorting independently of filter-bar controls. */
	sortBy(sort: string): void {
		this.filters.update(
			/** Preserve current field filters while changing sort order. */ (value) => ({
				...value,
				sort,
			}),
		)
		this.load()
	}
}
