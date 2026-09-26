import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	type OnDestroy,
	type OnInit,
	computed,
	inject,
	input,
	output,
	signal,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { form, FormField, maxLength, pattern, required } from '@angular/forms/signals'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { DatePicker } from '@fundamental-ngx/ui5-webcomponents/date-picker'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import {
	OrganisationStructureApi,
	structureErrorMessage,
	type StructureDetail,
} from '@empflowyee/hcm-web-workforce-foundation-data-access'
import type { StructureArea, UnitTypeDto } from '@empflowyee/hcm-workforce-foundation-contract'
import { StructureOptionBox, type OptionRef } from './option-box.component'
import { StructureDiscardDialog } from './discard-dialog.component'
import { StructureDraft } from './structure-draft'
import type { StructureAreaInfo } from './structure-areas'

export interface StatusDialogRequest {
	area: StructureAreaInfo
	item: StructureDetail
}

/** Focused Dialog to retire, disable or reactivate a structure item, or retire a unit from a date. */
@Component({
	selector: 'ef-hcm-structure-status-dialog',
	imports: [
		FormField,
		Dialog,
		Bar,
		Button,
		Form,
		FormItem,
		Label,
		TextArea,
		DatePicker,
		Text,
		MessageStrip,
		StructureOptionBox,
		StructureDiscardDialog,
	],
	template: `<ui5-dialog
			[open]="true"
			[headerText]="title()"
			[accessibleName]="title()"
			[initialFocus]="unit() ? 'structure-status-date' : 'structure-status-reason'"
			(ui5BeforeClose)="beforeClose($event)"
		>
			@if (draft.error()) {
				<ui5-message-strip design="Negative" [hideCloseButton]="true">
					{{ draft.error() }}
				</ui5-message-strip>
			}
			@if (retiring()) {
				<ui5-message-strip design="Critical" [hideCloseButton]="true">
					{{ request().item.name }} cannot be used for new records after this change. Items still
					used by current or future assignments, positions or child units cannot be retired.
				</ui5-message-strip>
			}
			<ui5-form [accessibleName]="title() + ' fields'" accessibleMode="Edit" layout="S1 M1 L1 XL1">
				@if (unit()) {
					<ui5-form-item>
						<ui5-label slot="labelContent" for="structure-status-date" [required]="true">
							Last effective date
						</ui5-label>
						<ui5-date-picker
							id="structure-status-date"
							accessibleName="Last effective date"
							valueFormat="yyyy-MM-dd"
							displayFormat="medium"
							[formField]="fields.effectiveTo"
							[disabled]="draft.saving()"
							[valueState]="
								fields.effectiveTo().touched() && fields.effectiveTo().invalid()
									? 'Negative'
									: 'None'
							"
						>
							<ui5-text slot="valueStateMessage"
								>Choose the last date the unit is effective.</ui5-text
							>
						</ui5-date-picker>
					</ui5-form-item>
					<ui5-form-item>
						<ui5-label slot="labelContent" for="structure-status-successor">
							Successor unit
						</ui5-label>
						<ef-hcm-structure-option-box
							kind="units"
							controlId="structure-status-successor"
							label="Successor unit"
							[selected]="successor()"
							[exclude]="[request().item.id]"
							[disabled]="draft.saving()"
							(selectedChange)="successor.set($event)"
						></ef-hcm-structure-option-box>
					</ui5-form-item>
				}
				<ui5-form-item>
					<ui5-label slot="labelContent" for="structure-status-reason" [required]="true">
						Reason for change
					</ui5-label>
					<ui5-textarea
						id="structure-status-reason"
						accessibleName="Reason for change"
						[rows]="3"
						[formField]="fields.reason"
						[disabled]="draft.saving()"
						[valueState]="
							fields.reason().touched() && fields.reason().invalid() ? 'Negative' : 'None'
						"
					>
						<ui5-text slot="valueStateMessage">Enter a reason of 1–500 characters.</ui5-text>
					</ui5-textarea>
				</ui5-form-item>
			</ui5-form>
			<ui5-bar slot="footer">
				<ui5-button
					slot="endContent"
					[design]="retiring() ? 'Negative' : 'Emphasized'"
					[disabled]="draft.saving()"
					(click)="save()"
				>
					{{ draft.saving() ? 'Saving…' : confirmLabel() }}
				</ui5-button>
				<ui5-button slot="endContent" [disabled]="draft.saving()" (click)="cancel()">
					Cancel
				</ui5-button>
			</ui5-bar>
		</ui5-dialog>
		<ef-hcm-structure-discard
			[open]="draft.confirmOpen()"
			(decided)="draft.decide($event)"
		></ef-hcm-structure-discard>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StructureStatusDialog implements OnInit, OnDestroy {
	readonly request = input.required<StatusDialogRequest>()
	readonly saved = output<StructureDetail>()
	readonly closed = output<void>()
	private readonly api = inject(OrganisationStructureApi)
	private readonly destroy = inject(DestroyRef)
	readonly model = signal({ effectiveTo: '', reason: '' })
	readonly successor = signal<OptionRef | null>(null)
	readonly unit = computed(
		/** Units retire from a date. */ () => this.request().area.id === 'units',
	)
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			required(path.effectiveTo, { when: /** Units retire from a date. */ () => this.unit() })
			required(path.reason)
			pattern(path.reason, /\S/)
			maxLength(path.reason, 500)
		},
	)
	readonly draft = new StructureDraft(
		/** Track the whole command draft. */ () => ({
			...this.model(),
			successor: this.successor()?.id,
		}),
	)
	readonly active = computed(
		/** Current availability of the item. */ () => {
			const item = this.request().item
			return 'enabled' in item ? item.enabled : item.active
		},
	)
	readonly retiring = computed(/** Deactivating rather than reactivating. */ () => this.active())
	readonly confirmLabel = computed(
		/** Name the exact command. */ () => {
			const type = this.request().area.id === 'unit-types'
			if (this.unit()) return 'Retire unit'
			if (this.retiring()) return type ? 'Disable' : 'Retire'
			return type ? 'Enable' : 'Reactivate'
		},
	)
	readonly title = computed(
		/** Name the operation and target. */ () =>
			`${this.confirmLabel()} ${this.request().item.name}`,
	)
	private allowClose = false

	/** Record the clean baseline. */
	ngOnInit(): void {
		this.draft.markClean()
	}

	/** Validate then persist one command with a stable retry key. */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		for (const field of [this.fields.effectiveTo, this.fields.reason])
			if (field().invalid()) {
				field().focusBoundControl()
				return
			}
		const { area, item } = this.request()
		const revision = (item as UnitTypeDto).revision
		const reason = this.model().reason.trim()
		let call
		if (this.unit()) {
			const body = {
				effectiveTo: this.model().effectiveTo,
				successorId: this.successor()?.id ?? null,
				expectedRevision: revision,
				reason,
			}
			call = this.api.retireUnit(item.id, body, this.draft.key({ retire: item.id, body }))
		} else {
			const body = { active: !this.active(), expectedRevision: revision, reason }
			call = this.api.setActive(
				area.id as StructureArea,
				item.id,
				body,
				this.draft.key({ active: item.id, body }),
			)
		}
		this.draft.saving.set(true)
		this.draft.error.set('')
		call.pipe(takeUntilDestroyed(this.destroy)).subscribe({
			next: /** Close after the server confirms. */ (detail) => {
				this.draft.saving.set(false)
				this.draft.markClean()
				this.allowClose = true
				this.saved.emit(detail)
			},
			error: /** Preserve the draft and retry key. */ (error) => {
				this.draft.saving.set(false)
				this.draft.error.set(structureErrorMessage(error))
			},
		})
	}

	/** Route Cancel and Escape through the same discard rule. */
	async cancel(): Promise<void> {
		if (await this.draft.canLeave()) {
			this.allowClose = true
			this.closed.emit()
		}
	}

	/** Keep dirty drafts when native Escape requests dismissal. */
	beforeClose(event: Event): void {
		if (event.target !== event.currentTarget || this.allowClose) return
		event.preventDefault()
		void this.cancel()
	}

	/** Allow the shell's navigation guard to consult this draft. */
	canLeave(): Promise<boolean> {
		return this.draft.canLeave()
	}

	/** Release a pending navigation decision. */
	ngOnDestroy(): void {
		this.draft.release()
	}
}
