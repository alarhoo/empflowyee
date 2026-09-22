import { DOCUMENT } from '@angular/common'
import { Injectable, computed, effect, inject, signal } from '@angular/core'
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js'
import { deriveAccentPalette, normalizeHexColor } from './color-utils'
import { HCM_THEMES, type HcmThemeVariant } from './hcm-theme.models'

const SAP_BRAND_VARIABLES = [
	'--sapBrandColor',
	'--sapHighlightColor',
	'--sapSelectedColor',
	'--sapButton_Emphasized_Background',
	'--sapButton_Emphasized_BorderColor',
	'--sapButton_Emphasized_Hover_Background',
	'--sapButton_Emphasized_Hover_BorderColor',
	'--sapButton_Emphasized_Active_Background',
	'--sapButton_Emphasized_Active_BorderColor',
	'--sapButton_Emphasized_TextColor',
	'--sapContent_FocusColor',
] as const

@Injectable({ providedIn: 'root' })
export class HcmThemeService {
	private readonly document = inject(DOCUMENT)
	private readonly _variant = signal<HcmThemeVariant>('her-light')
	private readonly _tenantPrimary = signal<string | null>(null)

	readonly variant = this._variant.asReadonly()
	readonly tenantPrimary = this._tenantPrimary.asReadonly()
	readonly definition = computed(
		/** Resolve the selected variant, falling back to the first theme definition. */ () =>
			HCM_THEMES.find(
				/** Match the requested variant identifier. */ (theme) => theme.id === this._variant(),
			) ?? HCM_THEMES[0],
	)
	readonly dark = computed(
		/** Expose whether the selected variant uses a dark UI5 base. */ () => this.definition().dark,
	)

	/** Connect template theme signals to DOM application. */ constructor() {
		effect(
			/** Apply the selected base theme and optional accent. */ () => {
				const definition = this.definition()
				const primary = this._tenantPrimary()
				this.apply(definition.id, definition.family, definition.ui5Theme, definition.dark, primary)
			},
		)
	}

	/** Store the requested governed variant. */ setVariant(variant: HcmThemeVariant): void {
		this._variant.set(variant)
	}

	/** Validate an optional hex accent without replacing valid data on error. */ setTenantPrimary(
		value: string | null,
	): boolean {
		if (value === null || value.trim() === '') {
			this._tenantPrimary.set(null)
			return true
		}
		const normalized = normalizeHexColor(value)
		if (!normalized) return false
		this._tenantPrimary.set(normalized)
		return true
	}

	/** Restore the selected theme's default accent. */ clearTenantPrimary(): void {
		this._tenantPrimary.set(null)
	}

	/** Apply document theme markers, semantic accents and the public SAP bridge. */ private apply(
		variant: HcmThemeVariant,
		family: 'horizon' | 'her',
		ui5Theme: 'sap_horizon' | 'sap_horizon_dark',
		dark: boolean,
		tenantPrimary: string | null,
	): void {
		const root = this.document.documentElement
		root.dataset['hcmThemeFamily'] = family
		root.dataset['hcmThemeVariant'] = variant
		root.style.colorScheme = dark ? 'dark' : 'light'

		setTheme(ui5Theme)
		this.clearBrandBridge(root)

		if (tenantPrimary) {
			const palette = deriveAccentPalette(tenantPrimary, dark)
			root.style.setProperty('--ef-color-accent', palette.primary)
			root.style.setProperty('--ef-color-accent-strong', palette.strong)
			root.style.setProperty('--ef-color-accent-hover', palette.hover)
			root.style.setProperty('--ef-color-accent-active', palette.active)
			root.style.setProperty('--ef-color-on-accent', palette.onPrimary)
		}

		// HER should tint native Horizon emphasis even when the tenant has no custom accent.
		// Horizon needs the bridge only when tenant branding overrides its native accent.
		if (family === 'her' || tenantPrimary) {
			this.applySapBrandBridgeFromEfTokens(root)
		}
	}

	/** Read semantic accent values and bridge the approved public SAP parameters. */ private applySapBrandBridgeFromEfTokens(
		root: HTMLElement,
	): void {
		const style = getComputedStyle(root)
		const primary = style.getPropertyValue('--ef-color-accent').trim()
		const strong = style.getPropertyValue('--ef-color-accent-strong').trim()
		const hover = style.getPropertyValue('--ef-color-accent-hover').trim()
		const active = style.getPropertyValue('--ef-color-accent-active').trim()
		const onPrimary = style.getPropertyValue('--ef-color-on-accent').trim()

		if (!primary || !strong || !hover || !active || !onPrimary) return

		root.style.setProperty('--sapBrandColor', primary)
		root.style.setProperty('--sapHighlightColor', strong)
		root.style.setProperty('--sapSelectedColor', strong)
		root.style.setProperty('--sapButton_Emphasized_Background', primary)
		root.style.setProperty('--sapButton_Emphasized_BorderColor', primary)
		root.style.setProperty('--sapButton_Emphasized_Hover_Background', hover)
		root.style.setProperty('--sapButton_Emphasized_Hover_BorderColor', hover)
		root.style.setProperty('--sapButton_Emphasized_Active_Background', active)
		root.style.setProperty('--sapButton_Emphasized_Active_BorderColor', active)
		root.style.setProperty('--sapButton_Emphasized_TextColor', onPrimary)
		root.style.setProperty('--sapContent_FocusColor', strong)
	}

	/** Remove all inline values owned by the template bridge. */ private clearBrandBridge(
		root: HTMLElement,
	): void {
		;[
			'--ef-color-accent',
			'--ef-color-accent-strong',
			'--ef-color-accent-hover',
			'--ef-color-accent-active',
			'--ef-color-on-accent',
			...SAP_BRAND_VARIABLES,
		].forEach(
			/** Remove one previously owned theme parameter. */ (name) => root.style.removeProperty(name),
		)
	}
}
