import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { FormField, type FieldTree } from '@angular/forms/signals'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { TimePicker } from '@fundamental-ngx/ui5-webcomponents/time-picker'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import type { SegmentForm } from './schedule-form'

/** Reuse the same native interval fields for weekly schedules, reusable shifts and dated overrides. */
@Component({
	selector: 'ef-hcm-attendance-segment-fields',
	imports: [FormField, Button, Form, FormItem, Label, Select, Option, TimePicker, Text],
	templateUrl: './segment-fields.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttendanceSegmentFields {
	readonly fields = input.required<FieldTree<SegmentForm>>()
	readonly label = input.required<string>()
	readonly removeLabel = input('Remove interval')
	readonly timeFormat = input.required<string>()
	readonly errors = input<Partial<Record<keyof SegmentForm, string>>>({})
	readonly disabled = input(false)
	readonly removed = output<void>()
}
