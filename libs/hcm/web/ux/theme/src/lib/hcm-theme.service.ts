import { DOCUMENT } from '@angular/common'
import { Injectable, computed, effect, inject, signal, DestroyRef } from '@angular/core'
import { HcmNativeThemeService } from './hcm-native-theme.service'
import { HER_TOKEN_NAMES, validateHerToken } from './her-token-contract'
import { SAP_ACCENT_PARAMETERS, SAP_HER_PARAMETERS } from './hcm-sap-theme-parameters'
import { deriveAccentPalette, normalizeHexColor } from './color-utils'
import { HCM_THEMES, type HcmThemeDefinition, type HcmThemeVariant } from './hcm-theme.models'

// Public SAP parameters only: no selectors or private UI5 shadow-DOM tokens.
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
	'--sapButton_Emphasized_Hover_TextColor',
	'--sapButton_Emphasized_Active_TextColor',
	'--sapContent_FocusColor',
] as const
const ACCENT_VARIABLES = [
	'--ef-color-accent',
	'--ef-color-accent-strong',
	'--ef-color-accent-hover',
	'--ef-color-accent-active',
	'--ef-color-on-accent',
] as const

@Injectable({ providedIn: 'root' })
export class HcmThemeService {
	private readonly document = inject(DOCUMENT)
	private readonly native = inject(HcmNativeThemeService)
	private readonly _variant = signal<HcmThemeVariant>('horizon-light')
	private readonly _appliedVariant = signal<HcmThemeVariant | null>(null)
	private readonly _loading = signal(false)
	private readonly _tenantPrimary = signal<string | null>(null)
	private readonly _error = signal<string | null>(null)
	private pending = Promise.resolve()
	private revision = 0
	private readonly _herOverrides = signal<Readonly<Record<string, string>>>({})
	readonly herOverrides = this._herOverrides.asReadonly()

	readonly variant = this._variant.asReadonly()
	readonly appliedVariant = this._appliedVariant.asReadonly()
	readonly loading = this._loading.asReadonly()
	readonly tenantPrimary = this._tenantPrimary.asReadonly()
	readonly error = this._error.asReadonly()
	readonly definition = computed(
		/** Resolve the selected variant to its native UI5 base. */ () =>
			HCM_THEMES.find(/** Match the selected variant. */ (theme) => theme.id === this._variant()) ??
			HCM_THEMES[0],
	)
	readonly dark = computed(
		/** Expose the selected mode to presentation consumers. */ () => this.definition().dark,
	)

	/** Serialize asset loading so rapid selections cannot leave a stale UI5 base or accent bridge. */
	constructor() {
		inject(DestroyRef).onDestroy(
			/** Invalidate pending work and release overrides on teardown. */ () => {
				this.revision++
				this.clearBrandBridge(this.document.documentElement)
				const root = this.document.documentElement
				delete root.dataset['hcmThemeFamily']
				delete root.dataset['hcmThemeVariant']
				delete root.dataset['hcmThemeLoading']
				root.style.removeProperty('color-scheme')
				this.native.clear()
			},
		)
		effect(
			/** Apply the latest selected variant and validated branding data. */ () => {
				const definition = this.definition()
				const primary = this._tenantPrimary()
				const overrides = this._herOverrides()
				const revision = ++this.revision
				this._loading.set(true)
				this.document.documentElement.dataset['hcmThemeLoading'] = 'true'
				this.pending = this.pending
					.then(
						/** Skip superseded requests before and after asynchronous asset loading. */ async () => {
							if (revision !== this.revision) return
							await this.native.apply(definition.ui5Theme)
							if (revision !== this.revision) return
							this.applyPalette(definition, primary, overrides)
							this._appliedVariant.set(definition.id)
							this._error.set(null)
						},
					)
					.finally(
						/** Reveal only a settled presentation and leave failures visible to the host. */ () => {
							if (revision !== this.revision) return
							this._loading.set(false)
							delete this.document.documentElement.dataset['hcmThemeLoading']
						},
					)
					.catch(
						/** Expose asset-loading failures without creating an unhandled rejection. */ () => {
							if (revision === this.revision)
								this._error.set(
									'Theme assets could not be loaded. Select another theme or reload the page.',
								)
						},
					)
			},
		)
	}

	/** Select one of the four governed variants; theme data cannot specify asset URLs or CSS. */
	setVariant(variant: HcmThemeVariant): void {
		this._variant.set(variant)
	}

	/** Store a normalized optional tenant accent, leaving the accepted value intact on invalid input. */
	setTenantPrimary(value: string | null): boolean {
		if (value === null || value.trim() === '') {
			this._tenantPrimary.set(null)
			return true
		}
		const normalized = normalizeHexColor(value)
		if (!normalized) return false
		this._tenantPrimary.set(normalized)
		return true
	}

	/** Remove tenant branding and restore the selected theme's supplied defaults. */
	clearTenantPrimary(): void {
		this._tenantPrimary.set(null)
	}

	/** Replace a validated semantic override map; Horizon keeps the draft without applying it. */
	setHerOverrides(tokens: Readonly<Record<string, string>>): void {
		const validated = Object.fromEntries(
			Object.entries(tokens).map(
				/** Reject unknown properties and unsafe CSS before application. */ ([name, value]) => [
					name,
					validateHerToken(name, value),
				],
			),
		)
		this._herOverrides.set(validated)
	}

	/** Await already scheduled theme work for diagnostics and deterministic tests. */
	whenSettled(): Promise<void> {
		return this.pending
	}

	/** Apply semantic surfaces only after the native UI5 base has loaded. */
	private applyPalette(
		definition: HcmThemeDefinition,
		tenantPrimary: string | null,
		overrides: Readonly<Record<string, string>>,
	): void {
		const root = this.document.documentElement
		this.clearBrandBridge(root)
		root.dataset['hcmThemeFamily'] = definition.family
		root.dataset['hcmThemeVariant'] = definition.id
		root.style.colorScheme = definition.dark ? 'dark' : 'light'
		if (definition.family === 'her') {
			for (const [name, value] of Object.entries(overrides)) root.style.setProperty(name, value)
		}
		if (tenantPrimary) {
			const surface = this.document.defaultView
				?.getComputedStyle(root)
				.getPropertyValue('--ef-surface-base')
				.trim()
			const palette = deriveAccentPalette(tenantPrimary, definition.dark, surface)
			const values = [
				palette.primary,
				palette.strong,
				palette.hover,
				palette.active,
				palette.onPrimary,
			]
			ACCENT_VARIABLES.forEach(
				/** Assign only governed semantic accent parameters. */ (name, index) =>
					root.style.setProperty(name, values[index]),
			)
		}
		if (definition.family === 'her') this.applySemanticParameters(root, SAP_HER_PARAMETERS)
		if (definition.family === 'her' || tenantPrimary) {
			this.applySapBrandBridge(root)
			this.applySemanticParameters(root, SAP_ACCENT_PARAMETERS)
			if (definition.family === 'her') {
				const focus = this.document.defaultView
					?.getComputedStyle(root)
					.getPropertyValue('--ef-focus-color')
					.trim()
				if (focus) root.style.setProperty('--sapContent_FocusColor', focus)
			}
		}
	}

	/** Bridge existing semantic colors into the documented public SAP emphasis parameters. */
	private applySapBrandBridge(root: HTMLElement): void {
		const style = this.document.defaultView?.getComputedStyle(root)
		if (!style) return
		const [primary, strong, hover, active, onPrimary] = ACCENT_VARIABLES.map(
			/** Read the resolved theme defaults or validated tenant overlay. */ (name) =>
				style.getPropertyValue(name).trim(),
		)
		if (!primary || !strong || !hover || !active || !onPrimary) return
		const values = [
			primary,
			strong,
			strong,
			primary,
			primary,
			hover,
			hover,
			active,
			active,
			onPrimary,
			onPrimary,
			onPrimary,
			strong,
		]
		SAP_BRAND_VARIABLES.forEach(
			/** Set only an approved public theme parameter. */ (name, index) =>
				root.style.setProperty(name, values[index]),
		)
	}

	/** Resolve semantic palette colors into native-control parameters without changing control markup. */
	private applySemanticParameters(
		root: HTMLElement,
		parameters: Readonly<Record<string, string>>,
	): void {
		const style = this.document.defaultView?.getComputedStyle(root)
		if (!style) return
		// Snapshot reads before writes: interleaving them recalculates every native control per token.
		const resolved = Object.entries(parameters).map(
			/** Resolve the palette once before mutating native parameters. */ ([parameter, semantic]) =>
				[parameter, style.getPropertyValue(semantic).trim()] as const,
		)
		for (const [parameter, value] of resolved) {
			if (value) root.style.setProperty(parameter, value)
		}
	}

	/** Remove every parameter owned by the bridge, including stale values after family changes. */
	private clearBrandBridge(root: HTMLElement): void {
		for (const name of [
			...ACCENT_VARIABLES,
			...HER_TOKEN_NAMES,
			...SAP_BRAND_VARIABLES,
			...Object.keys(SAP_ACCENT_PARAMETERS),
			...Object.keys(SAP_HER_PARAMETERS),
		])
			root.style.removeProperty(name)
	}
}
