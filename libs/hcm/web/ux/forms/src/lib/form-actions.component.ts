import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'

/** Present form actions and protect an explicit cancel from silently discarding unsaved edits. */
@Component({
	selector: 'ef-hcm-form-actions',
	imports: [Button],
	template: `
		@if (readOnly()) {
			<ui5-button (click)="editRequested.emit()">Edit</ui5-button>
		} @else {
			<div class="actions">
				<ui5-button
					design="Emphasized"
					[disabled]="saving() || !valid() || !dirty()"
					(click)="requestSave()"
					>{{ saving() ? 'Saving…' : 'Save' }}</ui5-button
				>
				<ui5-button [disabled]="saving()" (click)="requestCancel()">Cancel</ui5-button>
				<span role="status">{{ dirty() ? 'Unsaved changes' : 'No unsaved changes' }}</span>
			</div>
			@if (confirmingDiscard()) {
				<div class="confirmation" role="group" aria-label="Discard unsaved changes">
					<p>Discard your unsaved changes?</p>
					<ui5-button [disabled]="saving()" (click)="confirmDiscard()">Discard changes</ui5-button>
					<ui5-button (click)="confirmingDiscard.set(false)">Keep editing</ui5-button>
				</div>
			}
		}
	`,
	styles: `
		:host {
			display: block;
			margin-top: 1rem;
		}
		.actions {
			display: flex;
			align-items: center;
			flex-wrap: wrap;
			gap: 0.75rem;
		}
		.confirmation {
			padding: 1rem;
			margin-top: 1rem;
			border: 1px solid var(--ef-border-subtle);
			background: var(--ef-surface-base);
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HcmFormActions {
	readonly readOnly = input(false)
	readonly dirty = input(false)
	readonly saving = input(false)
	readonly valid = input(true)
	readonly saveRequested = output<void>()
	readonly cancelRequested = output<void>()
	readonly editRequested = output<void>()
	readonly confirmingDiscard = signal(false)

	/** Emit only when the supplied Signal Form can be saved; persistence stays in the feature. */
	requestSave(): void {
		if (!this.readOnly() && !this.saving() && this.valid() && this.dirty())
			this.saveRequested.emit()
	}

	/** Ask for an explicit discard when dirty, and prevent cancellation during submission. */
	requestCancel(): void {
		if (this.saving()) return
		if (this.dirty()) this.confirmingDiscard.set(true)
		else this.cancelRequested.emit()
	}

	/** Complete a confirmed discard without modifying the caller's form model. */
	confirmDiscard(): void {
		if (this.saving()) return
		this.confirmingDiscard.set(false)
		this.cancelRequested.emit()
	}
}
