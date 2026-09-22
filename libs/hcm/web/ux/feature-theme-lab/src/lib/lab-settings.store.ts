import { DOCUMENT } from '@angular/common'
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core'
import { setLanguage } from '@ui5/webcomponents-base/dist/config/Language.js'
import {
	HcmThemeService,
	contrastRatio,
	normalizeHexColor,
	parseHerTokenDocument,
	type HcmThemeVariant,
} from '@empflowyee/hcm-web-ux-theme'

@Injectable()
export class LabSettingsStore {
	readonly theme = inject(HcmThemeService)
	private readonly document = inject(DOCUMENT)
	readonly density = signal<'cozy' | 'compact'>('compact')
	readonly direction = signal<'ltr' | 'rtl'>('ltr')
	readonly locale = signal('en-US')
	readonly timezone = signal('America/New_York')
	readonly error = signal('')
	readonly revision = signal(0)
	readonly changedCount = computed(
		/** Count only deliberate token edits, independently of tenant branding. */ () =>
			Object.keys(this.theme.herOverrides()).length,
	)
	readonly contrastWarning = computed(
		/** Check text and emphasized actions against their currently resolved surfaces. */ () => {
			this.revision()
			const pairs = [
				['--ef-text-strong', '--ef-surface-base'],
				['--ef-text-muted', '--ef-surface-base'],
				['--ef-color-on-accent', '--ef-color-accent'],
			]
			return pairs.some(
				/** Detect unsafe combinations without rejecting an exploratory palette. */ ([fg, bg]) => {
					const a = normalizeHexColor(this.tokenValue(fg))
					const b = normalizeHexColor(this.tokenValue(bg))
					return a && b ? contrastRatio(a, b) < 4.5 : false
				},
			)
		},
	)
	/** Apply document-level previews only for this feature's lifetime. */
	constructor() {
		const root = this.document.documentElement
		const previous = {
			dir: root.dir,
			lang: root.lang,
			compact: root.classList.contains('ui5-content-density-compact'),
			compactMarker: root.hasAttribute('data-ui5-compact-size'),
		}
		effect(
			/** Keep native controls synchronized with preview direction, density and language. */ () => {
				root.dir = this.direction()
				root.lang = this.locale()
				root.classList.toggle('ui5-content-density-compact', this.density() === 'compact')
				root.toggleAttribute('data-ui5-compact-size', this.density() === 'compact')
				void setLanguage(this.locale()).catch(
					/** Expose locale asset failures instead of hiding them. */ () =>
						this.error.set('Locale assets could not be loaded.'),
				)
			},
		)
		effect(
			/** Refresh the visible token values after the asynchronous native palette settles. */ () => {
				this.theme.appliedVariant()
				this.theme.loading()
				this.theme.herOverrides()
				this.theme.tenantPrimary()
				if (!this.theme.loading())
					this.revision.update(/** Advance the resolved-token snapshot. */ (value) => value + 1)
			},
		)
		inject(DestroyRef).onDestroy(
			/** Release lab-only previews and drafts when leaving the route. */ () => {
				root.dir = previous.dir
				root.lang = previous.lang
				root.classList.toggle('ui5-content-density-compact', previous.compact)
				root.toggleAttribute('data-ui5-compact-size', previous.compactMarker)
				void setLanguage(previous.lang || 'en-US')
				this.theme.setHerOverrides({})
				this.theme.clearTenantPrimary()
				this.theme.setVariant('horizon-light')
			},
		)
	}
	/** Read resolved semantic defaults from the checked-in stylesheet rather than duplicating its palette. */
	tokenValue(name: string): string {
		this.revision()
		return (
			this.document.defaultView
				?.getComputedStyle(this.document.documentElement)
				.getPropertyValue(name)
				.trim() ?? ''
		)
	}
	/** Apply a selected native base and its governed semantic family. */
	selectTheme(variant: HcmThemeVariant): void {
		this.theme.setVariant(variant)
	}
	/** Validate before replacing a single token, leaving the last valid palette intact on error. */
	editToken(name: string, value: string): void {
		try {
			this.theme.setHerOverrides({ ...this.theme.herOverrides(), [name]: value })
			this.error.set('')
		} catch (error) {
			this.error.set(error instanceof Error ? error.message : 'Invalid token.')
		}
	}
	/** Restore checked-in defaults without erasing the independent tenant accent. */
	resetTokens(): void {
		this.theme.setHerOverrides({})
		this.error.set('')
	}
	/** Import the entire validated document atomically from the user's JSON draft. */
	importJson(json: string): boolean {
		try {
			const value = parseHerTokenDocument(json)
			this.theme.setHerOverrides(value.tokens)
			this.theme.setTenantPrimary(value.tenantPrimary)
			this.theme.setVariant(value.base)
			this.error.set('')
			return true
		} catch (error) {
			this.error.set(error instanceof Error ? error.message : 'Invalid JSON.')
			return false
		}
	}
	/** Serialize only the finite override map and branding data, never computed CSS or customer data. */
	exportJson(): string {
		return JSON.stringify(
			{
				schemaVersion: 1,
				base: this.theme.dark() ? 'her-dark' : 'her-light',
				tenantPrimary: this.theme.tenantPrimary(),
				tokens: this.theme.herOverrides(),
			},
			null,
			2,
		)
	}
	/** Format a fixed appointment with the selected locale/timezone so preview differences are reproducible. */
	appointment(): string {
		return new Intl.DateTimeFormat(this.locale(), {
			dateStyle: 'medium',
			timeStyle: 'short',
			timeZone: this.timezone(),
		}).format(new Date('2026-10-12T14:00:00Z'))
	}
}
