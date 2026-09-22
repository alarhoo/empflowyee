import { DynamicPageExample } from './dynamic-page-example.component'
import { ObjectPageExample } from './object-page-example.component'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { form, FormField } from '@angular/forms/signals'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { CheckBox } from '@fundamental-ngx/ui5-webcomponents/check-box'
import { HcmRuntimeStore, HCM_ROLES, HCM_ENTITLEMENTS } from '@empflowyee/hcm-web-runtime-context'
import { HCM_THEMES, HcmThemeService, type HcmThemeVariant } from '@empflowyee/hcm-web-ux-theme'

type PreviewId = 'dynamic-page' | 'object-page'

@Component({
	selector: 'ef-hcm-theme-lab',
	imports: [Button, CheckBox, FormField, DynamicPageExample, ObjectPageExample, Input],
	templateUrl: './theme-lab.component.html',
	styleUrl: './theme-lab.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeLabComponent {
	readonly theme = inject(HcmThemeService)
	readonly runtime = inject(HcmRuntimeStore)
	readonly themes = HCM_THEMES
	readonly roles = HCM_ROLES
	readonly entitlements = HCM_ENTITLEMENTS
	readonly activePreview = signal<PreviewId>('dynamic-page')
	readonly colorError = signal<string | null>(null)
	readonly colorModel = signal({ primary: '' })
	readonly colorForm = form(this.colorModel)
	readonly currentContextLabel = computed(
		/** Identify the active tenant and mock user. */ () =>
			`${this.runtime.tenant().displayName} · ${this.runtime.principal().displayName}`,
	)
	readonly previews: readonly { id: PreviewId; label: string }[] = [
		{ id: 'dynamic-page', label: 'Dynamic Page' },
		{ id: 'object-page', label: 'Object Page' },
	]

	/** Synchronize the editable branding field when accepted fixture branding changes. */
	constructor() {
		effect(
			/** Reflect reset and clear actions without discarding an invalid draft on keystrokes. */ () => {
				this.colorModel.set({ primary: this.runtime.tenant().primaryColor ?? '' })
				this.colorError.set(null)
			},
		)
	}

	/** Set a user presentation override so session edits do not reset the chosen theme. */
	selectTheme(variant: HcmThemeVariant): void {
		this.runtime.updatePreferences({ theme: variant })
	}

	/** Validate branding through the theme engine before storing it in fixture context. */
	onPrimaryColor(value: string): void {
		const ok = this.theme.setTenantPrimary(value)
		this.colorError.set(ok ? null : 'Use a three- or six-digit hex color, such as #b74435.')
		if (ok) {
			const primary = this.theme.tenantPrimary() ?? undefined
			this.runtime.setPrimaryColor(primary)
			this.colorModel.set({ primary: primary ?? '' })
		}
	}

	/** Clear the draft and tenant accent together, preserving the selected variant. */
	clearPrimary(): void {
		this.runtime.setPrimaryColor(undefined)
		this.theme.clearTenantPrimary()
		this.colorModel.set({ primary: '' })
		this.colorError.set(null)
	}
}
