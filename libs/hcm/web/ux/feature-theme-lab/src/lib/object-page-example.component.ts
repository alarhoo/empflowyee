import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core'
import { form, FormField, readonly } from '@angular/forms/signals'
import { HcmObjectPage, HcmObjectSection } from '@empflowyee/hcm-web-ux-floorplan-object-page'
import { AvatarComponent } from '@fundamental-ngx/core/avatar'
import { ObjectStatusComponent } from '@fundamental-ngx/core/object-status'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormGroup } from '@fundamental-ngx/ui5-webcomponents/form-group'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'

/** Demonstrate the production object floorplan with local, disposable employee-profile state. */
@Component({
	selector: 'ef-hcm-object-page-example',
	imports: [
		HcmObjectPage,
		HcmObjectSection,
		AvatarComponent,
		ObjectStatusComponent,
		Form,
		FormGroup,
		FormItem,
		Input,
		Label,
		MessageStrip,
		Dialog,
		Button,
		FormField,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
	],
	templateUrl: './object-page-example.component.html',
	styleUrl: './floorplan-examples.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObjectPageExample {
	readonly state = input<'content' | 'loading' | 'empty' | 'error' | 'denied' | 'unavailable'>(
		'content',
	)
	readonly readOnly = input(false)
	readonly recovered = signal(false)
	readonly editing = signal(false)
	readonly notice = signal('')
	readonly referenceOpen = signal(false)
	readonly effectiveState = computed(
		/** Retry updates only this disposable preview. */ () =>
			this.state() === 'error' && this.recovered() ? 'content' : this.state(),
	)
	readonly saved = signal({ jobTitle: 'People Operations Partner', location: 'Bengaluru' })
	readonly draft = signal(this.saved())
	readonly fields = form(
		this.draft,
		/** Keep native field availability under Signal Forms ownership. */ (path) => {
			readonly(path, {
				when: /** Lock fields until the consumer explicitly enters edit mode. */ () =>
					this.readOnly() || !this.editing(),
			})
		},
	)
	readonly actions = computed(
		/** Keep edit completion in the persistent native action toolbar even when the header snaps. */ () => {
			if (this.editing())
				return [
					{ id: 'save', label: 'Save preview', mutates: true, emphasized: true },
					{ id: 'cancel', label: 'Cancel edit' },
				]
			return [
				{ id: 'edit', label: 'Edit preview', mutates: true, emphasized: true },
				{ id: 'reference', label: 'Show reference' },
			]
		},
	)
	readonly history = [
		{ date: '15 Sep 2026', event: 'Team assignment updated', detail: 'People Operations' },
		{ date: '01 Jul 2026', event: 'Role updated', detail: 'People Operations Partner' },
		{ date: '01 Apr 2026', event: 'Location confirmed', detail: 'Bengaluru' },
		{ date: '01 Jan 2026', event: 'Annual review completed', detail: 'Development plan recorded' },
		{ date: '01 Oct 2025', event: 'Manager assigned', detail: 'Jordan Lee' },
		{ date: '15 Jun 2025', event: 'Employee joined', detail: 'Permanent / Full time' },
	]

	/** Start a local edit or show the fictional record identifier; no backend operation occurs. */
	handleAction(id: string): void {
		if (id === 'edit' && !this.readOnly()) {
			this.draft.set({ ...this.saved() })
			this.editing.set(true)
			this.notice.set('Editing a disposable preview. No employee data will be persisted.')
		} else if (id === 'save' && !this.readOnly()) this.finishEdit(true)
		else if (id === 'cancel') this.finishEdit(false)
		else if (id === 'reference') this.referenceOpen.set(true)
	}

	/** Save or discard the in-memory draft while keeping the example explicitly non-persistent. */
	finishEdit(save: boolean): void {
		if (save) this.saved.set({ ...this.draft() })
		else this.draft.set({ ...this.saved() })
		this.editing.set(false)
		this.notice.set(save ? 'Preview updated. No data was persisted.' : 'Preview changes discarded.')
	}
}
