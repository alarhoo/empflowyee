import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { MyProfileApi } from '@empflowyee/hcm-web-employee-data-access'
import { ProfileDialog } from './profile-dialog'

export interface RemoveRequest {
	kind: 'contact' | 'relationship'
	id: string
	label: string
	revision: number
}

/** Confirm removing a contact point or relationship from the profile; history is kept. */
@Component({
	selector: 'ef-hcm-my-profile-remove-dialog',
	imports: [Dialog, Bar, Button, Text, MessageStrip],
	template: `
		<ui5-dialog
			[open]="true"
			[headerText]="'Remove ' + request().label"
			[accessibleName]="'Remove ' + request().label"
			state="Critical"
			(ui5BeforeClose)="beforeClose($event)"
		>
			@if (draft.error()) {
				<ui5-message-strip design="Negative" [hideCloseButton]="true">
					{{ draft.error() }}
				</ui5-message-strip>
			}
			<ui5-text>{{ request().label }} will no longer appear on your profile.</ui5-text>
			<ui5-bar slot="footer">
				<ui5-button
					slot="endContent"
					design="Negative"
					[disabled]="draft.saving()"
					(click)="confirm()"
				>
					{{ draft.saving() ? 'Removing…' : 'Remove' }}
				</ui5-button>
				<ui5-button slot="endContent" [disabled]="draft.saving()" (click)="cancel()">
					Cancel
				</ui5-button>
			</ui5-bar>
		</ui5-dialog>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemoveDialog extends ProfileDialog {
	readonly request = input.required<RemoveRequest>()
	private readonly api = inject(MyProfileApi)
	private readonly confirmed = signal(false)
	readonly draft = new HcmDraft(/** Nothing to discard. */ () => this.confirmed())

	/** Remove the entry at its revision. */
	confirm(): void {
		if (this.draft.saving()) return
		const r = this.request()
		const key = this.draft.key({ remove: r.id, revision: r.revision })
		this.submit(
			r.kind === 'contact'
				? this.api.removeContact(r.id, r.revision, key)
				: this.api.removeRelationship(r.id, r.revision, key),
		)
	}
}
