import {
	ChangeDetectionStrategy,
	Component,
	type OnInit,
	inject,
	input,
	signal,
} from '@angular/core'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmDiscardDialog, HcmDraft } from '@empflowyee/hcm-web-ux-forms'
import { MyProfileApi } from '@empflowyee/hcm-web-employee-data-access'
import type { MyProfileFieldDto, ProfileVisibility } from '@empflowyee/hcm-employee-contract'
import { VISIBILITY_LABELS } from './labels'
import { ProfileDialog } from './profile-dialog'

/** Focused Dialog to narrow who sees one field; choices never exceed the policy. */
@Component({
	selector: 'ef-hcm-my-profile-visibility-dialog',
	imports: [
		Dialog,
		Bar,
		Button,
		Form,
		FormItem,
		Label,
		Select,
		Option,
		Text,
		MessageStrip,
		HcmDiscardDialog,
	],
	templateUrl: './visibility-dialog.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisibilityDialog extends ProfileDialog implements OnInit {
	readonly field = input.required<MyProfileFieldDto>()
	private readonly api = inject(MyProfileApi)
	readonly labels = VISIBILITY_LABELS
	readonly choice = signal('policy')
	readonly draft = new HcmDraft(/** Track the draft. */ () => this.choice())

	/** Start from the current preference; empty means the policy applies. */
	ngOnInit(): void {
		this.choice.set(this.field().preference?.visibility ?? 'policy')
		this.draft.markClean()
	}

	/** Read the Select. */
	setChoice(target: EventTarget | null): void {
		this.choice.set(String((target as HTMLSelectElement | null)?.value ?? ''))
	}

	/** Submit the preference, or clear it to follow the policy. */
	save(): void {
		if (this.draft.saving()) return
		const field = this.field()
		const body = {
			visibility: this.choice() === 'policy' ? null : (this.choice() as ProfileVisibility),
			expectedRevision: field.preference?.revision ?? null,
		}
		this.submit(this.api.setVisibility(field.ref, body, this.draft.key({ ref: field.ref, body })))
	}
}
