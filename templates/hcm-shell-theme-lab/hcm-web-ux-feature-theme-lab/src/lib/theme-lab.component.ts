import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { HCM_THEMES, HcmThemeService, type HcmThemeVariant } from '@empflowyee/hcm-web-ux-theme'

type PreviewId = 'overview' | 'object-page' | 'flexible-columns' | 'table-form'

@Component({
	selector: 'ef-theme-lab',
	standalone: true,
	imports: [Button, Input],
	templateUrl: './theme-lab.component.html',
	styleUrl: './theme-lab.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeLabComponent {
	readonly theme = inject(HcmThemeService)
	readonly runtime = inject(HcmRuntimeStore)
	readonly themes = HCM_THEMES
	readonly activePreview = signal<PreviewId>('overview')
	readonly colorError = signal<string | null>(null)
	readonly currentContextLabel = computed(
		/** Display the current fixture tenant and principal. */ () =>
			`${this.runtime.tenant().displayName} · ${this.runtime.principal().displayName}`,
	)

	readonly previews: readonly { id: PreviewId; label: string }[] = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'object-page', label: 'Object Page' },
		{ id: 'flexible-columns', label: 'Flexible Columns' },
		{ id: 'table-form', label: 'Table + Form' },
	]

	/** Select a theme variant in the supplied template. */ selectTheme(
		variant: HcmThemeVariant,
	): void {
		this.theme.setVariant(variant)
	}

	/** Validate a primary color and expose input errors. */ onPrimaryColor(value: string): void {
		const ok = this.theme.setTenantPrimary(value)
		this.colorError.set(ok ? null : 'Use a valid hex color such as #b74435.')
	}

	/** Clear optional tenant branding and any validation error. */ clearPrimary(): void {
		this.theme.clearTenantPrimary()
		this.colorError.set(null)
	}
}
