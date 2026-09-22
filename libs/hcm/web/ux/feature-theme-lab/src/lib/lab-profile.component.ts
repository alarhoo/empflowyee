import {
	HcmObjectPage,
	HcmObjectSection,
	type HcmObjectAction,
} from '@empflowyee/hcm-web-ux-floorplan-object-page'
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	input,
	output,
	signal,
} from '@angular/core'
import { Avatar } from '@fundamental-ngx/ui5-webcomponents/avatar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Card } from '@fundamental-ngx/ui5-webcomponents/card'
import { CardHeader } from '@fundamental-ngx/ui5-webcomponents/card-header'
import { ComboBoxItem } from '@fundamental-ngx/ui5-webcomponents/combo-box-item'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { ComboBox } from '@fundamental-ngx/ui5-webcomponents/combo-box'
import { DatePicker } from '@fundamental-ngx/ui5-webcomponents/date-picker'
import { DateRangePicker } from '@fundamental-ngx/ui5-webcomponents/date-range-picker'
import { DateTimePicker } from '@fundamental-ngx/ui5-webcomponents/date-time-picker'
import { ExpandableText } from '@fundamental-ngx/ui5-webcomponents/expandable-text'
import { FileUploader } from '@fundamental-ngx/ui5-webcomponents/file-uploader'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormGroup } from '@fundamental-ngx/ui5-webcomponents/form-group'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { IllustratedMessage } from '@fundamental-ngx/ui5-webcomponents-fiori/illustrated-message'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Link } from '@fundamental-ngx/ui5-webcomponents/link'
import { MultiComboBoxItem } from '@fundamental-ngx/ui5-webcomponents/multi-combo-box-item'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { MultiComboBox } from '@fundamental-ngx/ui5-webcomponents/multi-combo-box'
import { MultiInput } from '@fundamental-ngx/ui5-webcomponents/multi-input'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { ProgressIndicator } from '@fundamental-ngx/ui5-webcomponents/progress-indicator'
import { RadioButton } from '@fundamental-ngx/ui5-webcomponents/radio-button'
import { RatingIndicator } from '@fundamental-ngx/ui5-webcomponents/rating-indicator'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Switch } from '@fundamental-ngx/ui5-webcomponents/switch'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { Tag } from '@fundamental-ngx/ui5-webcomponents/tag'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { TimePicker } from '@fundamental-ngx/ui5-webcomponents/time-picker'
import { Timeline } from '@fundamental-ngx/ui5-webcomponents-fiori/timeline'
import { TimelineItem } from '@fundamental-ngx/ui5-webcomponents-fiori/timeline-item'
import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { Token } from '@fundamental-ngx/ui5-webcomponents/token'
import { Tokenizer } from '@fundamental-ngx/ui5-webcomponents/tokenizer'
import { UploadCollection } from '@fundamental-ngx/ui5-webcomponents-fiori/upload-collection'
import { UploadCollectionItem } from '@fundamental-ngx/ui5-webcomponents-fiori/upload-collection-item'
import { form, FormField } from '@angular/forms/signals'
import type { LabEmployee } from './lab-data'
@Component({
	standalone: true,
	selector: 'ef-hcm-lab-profile',
	imports: [
		HcmObjectPage,
		HcmObjectSection,
		Avatar,
		Button,
		Card,
		CardHeader,
		ComboBoxItem,
		CheckBox,
		ComboBox,
		DatePicker,
		DateRangePicker,
		DateTimePicker,
		ExpandableText,
		FileUploader,
		Form,
		FormGroup,
		FormItem,
		IllustratedMessage,
		Input,
		Label,
		Link,
		MultiComboBoxItem,
		MessageStrip,
		MultiComboBox,
		MultiInput,
		Option,
		ProgressIndicator,
		RadioButton,
		RatingIndicator,
		Select,
		Switch,
		Table,
		TableCell,
		TableHeaderCell,
		TableHeaderRow,
		TableRow,
		Tag,
		Text,
		TextArea,
		TimePicker,
		Timeline,
		TimelineItem,
		Title,
		Token,
		Tokenizer,
		UploadCollection,
		UploadCollectionItem,
		FormField,
	],
	templateUrl: './lab-profile.component.html',
	styleUrl: './lab.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabProfileComponent {
	readonly employee = input.required<LabEmployee>()
	readonly back = output<void>()
	readonly context = output<{ title: string; description: string }>()
	readonly editing = signal(false)
	readonly actions = computed<readonly HcmObjectAction[]>(
		/** Keep profile actions in the feature while the floorplan owns native overflow behavior. */ () => [
			{ id: 'back', label: 'Back to employees', icon: 'nav-back' },
			{
				id: 'edit',
				label: this.editing() ? 'Save preview' : 'Edit profile',
				emphasized: true,
				mutates: true,
			},
			...(this.editing() ? [{ id: 'cancel', label: 'Cancel' }] : []),
		],
	)
	/** Handle domain actions emitted by the reusable Object Page. */
	handleAction(id: string): void {
		if (id === 'back') this.back.emit()
		else if (id === 'edit') this.toggleEdit()
		else if (id === 'cancel') this.cancelEdit()
	}
	readonly notice = signal('')
	readonly profile = signal({
		preferred: '',
		birth: '',
		email: '',
		phone: '',
		bio: '',
		pronouns: 'Prefer not to say',
		location: '',
	})
	readonly profileForm = form(this.profile)
	private saved = this.profile()
	readonly contacts = signal(['Emergency contact · demo'])
	readonly documents = signal(['Employment agreement.pdf', 'Onboarding checklist.pdf'])
	/** Reset local forms when a different fictional employee is selected. */
	constructor() {
		effect(
			/** Initialize the profile draft from deterministic fixtures. */ () => {
				const person = this.employee()
				this.saved = {
					preferred: person.preferredName,
					pronouns: 'Prefer not to say',
					location: person.location,
					birth: person.dateOfBirth,
					email: person.email,
					phone: person.phone,
					bio: 'Helping our team and customers do their best work.',
				}
				this.profile.set(this.saved)
				this.editing.set(false)
				this.notice.set('')
				this.documents.set([...person.documents])
				this.contacts.set(['Emergency contact · demo'])
			},
		)
	}
	/** Enter edit mode or save the disposable signal-form draft. */
	toggleEdit(): void {
		if (this.editing()) {
			this.saved = this.profile()
			this.notice.set('Preview saved locally. No employee record was updated.')
		} else this.notice.set('Editing a fictional profile.')
		this.editing.update(/** Toggle the local editor. */ (value) => !value)
	}
	/** Restore the last local save without changing the employee fixture. */
	cancelEdit(): void {
		this.profile.set(this.saved)
		this.editing.set(false)
		this.notice.set('Preview edits discarded.')
	}
	/** Add a bounded contact label to demonstrate native token entry. */
	addContact(value: string): void {
		if (value.trim() && value.length <= 80)
			this.contacts.update(
				/** Keep token labels unique. */ (items) => [...new Set([...items, value.trim()])],
			)
	}
	/** Remove the selected native token. */
	removeContact(value: string): void {
		this.contacts.update(
			/** Retain other contact labels. */ (items) =>
				items.filter(/** Match the removed label. */ (item) => item !== value),
		)
	}
	/** Record file names only; never read bytes or initiate network uploads. */
	addFiles(files: File[] | FileList): void {
		this.documents.update(
			/** Merge names into the disposable collection. */ (items) => [
				...new Set([
					...items,
					...Array.from(files).map(/** Extract only a local filename. */ (file) => file.name),
				]),
			],
		)
	}
	/** Delete only the local collection item. */
	removeDocument(name: string): void {
		this.documents.update(
			/** Keep unrelated filenames. */ (items) =>
				items.filter(/** Identify the removed item. */ (item) => item !== name),
		)
	}
}
