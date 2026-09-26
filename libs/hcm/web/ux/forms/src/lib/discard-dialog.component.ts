import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'

/** Native confirmation before an unsaved structure draft is discarded. */
@Component({
	selector: 'ef-hcm-structure-discard',
	imports: [Dialog, Bar, Button, Text],
	template: `<ui5-dialog
		[open]="open()"
		headerText="Discard changes?"
		accessibleName="Discard changes?"
		initialFocus="keep-structure-draft"
		(ui5Close)="decided.emit(false)"
	>
		<ui5-text>Your unsaved changes will be discarded.</ui5-text>
		<ui5-bar slot="footer">
			<ui5-button slot="endContent" design="Negative" (click)="decided.emit(true)">
				Discard changes
			</ui5-button>
			<ui5-button id="keep-structure-draft" slot="endContent" (click)="decided.emit(false)">
				Keep editing
			</ui5-button>
		</ui5-bar>
	</ui5-dialog>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StructureDiscardDialog {
	readonly open = input(false)
	readonly decided = output<boolean>()
}
