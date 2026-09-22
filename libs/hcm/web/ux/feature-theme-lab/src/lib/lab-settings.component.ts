import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { ColorPicker } from '@fundamental-ngx/ui5-webcomponents/color-picker'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormGroup } from '@fundamental-ngx/ui5-webcomponents/form-group'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Page } from '@fundamental-ngx/ui5-webcomponents-fiori/page'
import { Panel } from '@fundamental-ngx/ui5-webcomponents/panel'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { StepInput } from '@fundamental-ngx/ui5-webcomponents/step-input'
import { Switch } from '@fundamental-ngx/ui5-webcomponents/switch'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { Tag } from '@fundamental-ngx/ui5-webcomponents/tag'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { form, FormField } from '@angular/forms/signals'
import {
	HCM_THEMES,
	HER_COLOR_GROUPS,
	HER_RADIUS_TOKENS,
	HER_SHADOW_TOKENS,
	HER_SHADOW_PRESETS,
} from '@empflowyee/hcm-web-ux-theme'
import { LabSettingsStore } from './lab-settings.store'
@Component({
	selector: 'ef-hcm-lab-settings',
	imports: [
		Bar,
		Button,
		ColorPicker,
		Dialog,
		Form,
		FormGroup,
		FormItem,
		Input,
		Label,
		MessageStrip,
		Option,
		Page,
		Panel,
		Select,
		StepInput,
		Switch,
		Table,
		TableCell,
		TableHeaderCell,
		TableHeaderRow,
		TableRow,
		Tag,
		Text,
		TextArea,
		Title,
		FormField,
	],
	templateUrl: './lab-settings.component.html',
	styleUrl: './lab.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabSettingsComponent {
	readonly settings = inject(LabSettingsStore)
	readonly themes = HCM_THEMES
	readonly zones = ['America/New_York', 'Europe/Berlin', 'Asia/Kolkata']
	readonly colorGroups = Object.entries(HER_COLOR_GROUPS).map(
		/** Present the governed semantic groups. */ ([label, names]) => ({
			label,
			tokens: names.map(/** Prefix a semantic name. */ (name) => '--ef-' + name),
		}),
	)
	readonly radii = HER_RADIUS_TOKENS
	readonly shadows = HER_SHADOW_TOKENS
	readonly shadowPresets = HER_SHADOW_PRESETS
	readonly draft = signal({ primary: '', json: '' })
	readonly draftForm = form(this.draft)
	readonly transfer = signal<'import' | 'export' | null>(null)
	/** Keep branding drafts synchronized with imports and resets. */
	constructor() {
		effect(
			/** Reflect accepted branding while preserving unrelated JSON edits. */ () => {
				const primary = this.settings.theme.tenantPrimary() ?? ''
				this.draft.update(
					/** Replace only the branding field. */ (value) => ({ ...value, primary }),
				)
			},
		)
	}
	/** Apply a strict optional hex accent without accepting arbitrary CSS. */
	applyPrimary(): void {
		this.settings.error.set(
			this.settings.theme.setTenantPrimary(this.draft().primary)
				? ''
				: 'Use a three- or six-digit hex color.',
		)
	}
	/** Remove the accent independently of the selected theme and token draft. */
	resetPrimary(): void {
		this.settings.theme.clearTenantPrimary()
	}
	/** Open a native dialog with an editable import or a serialized export. */
	openTransfer(mode: 'import' | 'export'): void {
		this.draft.update(
			/** Initialize the JSON text. */ (value) => ({
				...value,
				json: mode === 'export' ? this.settings.exportJson() : '',
			}),
		)
		this.transfer.set(mode)
	}
	/** Close import only after the entire document validates. */
	importDraft(): void {
		if (this.settings.importJson(this.draft().json)) this.transfer.set(null)
	}
	/** Download a local JSON file; theme values are never submitted to a backend. */
	download(): void {
		const url = URL.createObjectURL(
			new Blob([this.settings.exportJson()], { type: 'application/json' }),
		)
		const link = document.createElement('a')
		link.href = url
		link.download = 'empflowyee-her-theme.json'
		link.click()
		URL.revokeObjectURL(url)
	}
	/** Convert a pixel default to rem for the bounded numeric editor. */
	radiusValue(name: string): number {
		const value = this.settings.tokenValue(name)
		return Number.parseFloat(value) / (value.endsWith('px') ? 16 : 1)
	}
	/** Normalize the native picker's RGB output before strict semantic validation. */
	pickerColor(value: string): void {
		const match = /^rgba?\((\d+),?\s+(\d+),?\s+(\d+)/.exec(value)
		const hex = match
			? '#' +
				match
					.slice(1, 4)
					.map(
						/** Encode a picker channel. */ (channel) =>
							Number(channel).toString(16).padStart(2, '0'),
					)
					.join('')
			: value
		this.settings.editToken('--ef-color-accent', hex)
	}
}
