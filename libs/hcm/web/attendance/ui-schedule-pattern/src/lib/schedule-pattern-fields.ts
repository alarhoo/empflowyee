import { ChangeDetectionStrategy, Component, input, viewChildren } from '@angular/core'
import { FormField } from '@angular/forms/signals'
import { HcmDateField } from '@empflowyee/hcm-web-ux-forms'
import { WEEKDAYS } from './schedule-form'
import type { SchedulePatternState } from './schedule-pattern-state'
import { AttendanceSegmentFields } from './segment-fields'
import type { SegmentForm } from './schedule-form'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { StepInput } from '@fundamental-ngx/ui5-webcomponents/step-input'
import { DatePicker } from '@fundamental-ngx/ui5-webcomponents/date-picker'
import { ComboBox } from '@fundamental-ngx/ui5-webcomponents/combo-box'
import { ComboBoxItem } from '@fundamental-ngx/ui5-webcomponents/combo-box-item'
import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'

/** Render the shared weekly-pattern controls; all data loading, submission and page composition remain feature-owned. */
@Component({
	selector: 'ef-hcm-schedule-pattern-fields',
	imports: [
		FormField,
		HcmDateField,
		Button,
		Form,
		FormItem,
		Label,
		Input,
		TextArea,
		Select,
		Option,
		CheckBox,
		StepInput,
		DatePicker,
		AttendanceSegmentFields,
		ComboBox,
		ComboBoxItem,
		Title,
		Text,
		MessageStrip,
	],
	templateUrl: './schedule-pattern-fields.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchedulePatternFields {
	readonly editor = input.required<SchedulePatternState & { readonly id: string | null }>()
	readonly dateFormat = input.required<string>()
	readonly timeFormat = input.required<string>()
	readonly propertiesLabel = input('Schedule properties')
	readonly weekdays = WEEKDAYS
	readonly zones = ['UTC', ...Intl.supportedValuesOf('timeZone')]
	private readonly numericControls = viewChildren(StepInput)
	/** Map the owning form's reactive errors to the shared interval controls without moving business validation. */
	segmentErrors(day: number, index: number): Partial<Record<keyof SegmentForm, string>> {
		const result: Partial<Record<keyof SegmentForm, string>> = {}
		for (const key of [
			'startTime',
			'endTime',
			'endDayOffset',
			'kind',
			'startOverlap',
			'endOverlap',
		] as const) {
			let path: string = key
			if (key === 'startOverlap') path = 'overlapOffset.start'
			if (key === 'endOverlap') path = 'overlapOffset.end'
			result[key] = this.editor().fieldError(`days.${day}.segments.${index}.${path}`)
		}
		return result
	}
	/** Focus only a declared native numeric field after source validation rejects its value. */
	focusNumeric(id: string): void {
		const control = this.numericControls().find(
			/** Match the rendered form's stable numeric identity. */ (item) =>
				item.elementRef.nativeElement.id === id,
		)
		void control?.elementRef.nativeElement.focus()
	}
}
