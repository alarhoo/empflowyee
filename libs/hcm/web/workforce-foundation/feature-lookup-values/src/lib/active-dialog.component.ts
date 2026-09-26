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
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import {
	LookupValuesApi,
	lookupErrorMessage,
} from '@empflowyee/hcm-web-workforce-foundation-data-access'
import type { LookupSetDto, LookupValueDto } from '@empflowyee/hcm-workforce-foundation-contract'

/** Focused Dialog to retire or reactivate one tenant lookup value; there is no delete. */
@Component({
	selector: 'ef-hcm-lookup-active-dialog',
	imports: [
		FormField,
		Dialog,
		Bar,
		Button,
		Form,
		FormItem,
		Label,
		TextArea,
		Text,
		MessageStrip,
		HcmDiscardDialog,
	],
	template: `<ui5-dialog
			[open]="true"
			[headerText]="title()"
			[accessibleName]="title()"
			initialFocus="lookup-active-reason"
			(ui5BeforeClose)="beforeClose($event)"
		>
			@if (draft.error()) {
				<ui5-message-strip design="Negative" [hideCloseButton]="true">
					{{ draft.error() }}
				</ui5-message-strip>
			}
			@if (value().active) {
				<ui5-message-strip design="Critical" [hideCloseButton]="true">
					{{ value().name }} will no longer be offered for new records. Existing records keep it.
				</ui5-message-strip>
			}
			<ui5-form [accessibleName]="title() + ' fields'" accessibleMode="Edit" layout="S1 M1 L1 XL1">
				<ui5-form-item>
					<ui5-label slot="labelContent" for="lookup-active-reason" [required]="true">
						Reason for change
					</ui5-label>
					<ui5-textarea
						id="lookup-active-reason"
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
					[design]="value().active ? 'Negative' : 'Emphasized'"
					[disabled]="draft.saving()"
					(click)="save()"
				>
					{{ draft.saving() ? 'Saving…' : value().active ? 'Retire' : 'Reactivate' }}
				</ui5-button>
				<ui5-button slot="endContent" [disabled]="draft.saving()" (click)="cancel()">
					Cancel
				</ui5-button>
			</ui5-bar>
		</ui5-dialog>
		<ef-hcm-discard-dialog
			[open]="draft.confirmOpen()"
			(decided)="draft.decide($event)"
		></ef-hcm-discard-dialog>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LookupActiveDialog implements OnInit, OnDestroy {
	readonly set = input.required<LookupSetDto>()
	readonly value = input.required<LookupValueDto>()
	readonly saved = output<LookupValueDto>()
	readonly closed = output<void>()
	private readonly api = inject(LookupValuesApi)
	private readonly destroy = inject(DestroyRef)
	readonly model = signal({ reason: '' })
	readonly fields = form(
		this.model,
		/** Synchronous constraints mirroring the contract. */ (path) => {
			required(path.reason)
			pattern(path.reason, /\S/)
			maxLength(path.reason, 500)
		},
	)
	readonly draft = new HcmDraft(/** Track the reason. */ () => this.model())
	readonly title = computed(
		/** Name the operation and target. */ () =>
			`${this.value().active ? 'Retire' : 'Reactivate'} ${this.value().name}`,
	)
	private allowClose = false

	/** Record the clean baseline. */
	ngOnInit(): void {
		this.draft.markClean()
	}

	/** Validate, then persist one command with a stable retry key. */
	save(): void {
		if (this.draft.saving()) return
		this.fields().markAsTouched()
		if (this.fields.reason().invalid()) {
			this.fields.reason().focusBoundControl()
			return
		}
		const value = this.value()
		const body = {
			active: !value.active,
			expectedRevision: value.revision,
			reason: this.model().reason.trim(),
		}
		this.draft.saving.set(true)
		this.draft.error.set('')
		this.api
			.setActive(this.set().key, value.id, body, this.draft.key({ id: value.id, body }))
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Close after the server confirms. */ (saved) => {
					this.draft.saving.set(false)
					this.draft.markClean()
					this.allowClose = true
					this.saved.emit(saved)
				},
				error: /** Preserve the draft and retry key. */ (error) => {
					this.draft.saving.set(false)
					this.draft.error.set(lookupErrorMessage(error))
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
