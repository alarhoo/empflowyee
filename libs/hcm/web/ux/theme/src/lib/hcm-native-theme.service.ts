import { DOCUMENT } from '@angular/common'
import { Injectable, inject } from '@angular/core'
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js'
import { ThemingService } from '@fundamental-ngx/core/theming'

// UI5 theme state is document-global, including across Angular/Storybook root remounts.
const nativeQueues = new WeakMap<Document, Promise<void>>()
const loadedThemes = new WeakMap<Document, 'sap_horizon' | 'sap_horizon_dark'>()

/** Coordinate the maintained UI5 and Fundamental theme loaders using local, governed assets. */
@Injectable({ providedIn: 'root' })
export class HcmNativeThemeService {
	private readonly document = inject(DOCUMENT)
	private readonly fundamental = inject(ThemingService)
	private generation = 0
	private readonly pendingLoads = new Set<() => void>()

	/** Load both native theme layers before the semantic palette is marked as applied. */
	async apply(theme: 'sap_horizon' | 'sap_horizon_dark'): Promise<void> {
		const generation = this.generation
		const pending = (nativeQueues.get(this.document) ?? Promise.resolve()).then(
			/** Serialize global native updates across successive Angular root owners. */ async () => {
				if (generation !== this.generation) return
				await this.load(theme, generation)
			},
		)
		nativeQueues.set(
			this.document,
			pending.catch(/** Let a later owner recover after an asset failure. */ () => undefined),
		)
		await pending
	}

	/** Load native assets only while this service still owns its outstanding request. */
	private async load(theme: 'sap_horizon' | 'sap_horizon_dark', generation: number): Promise<void> {
		// Semantic edits and tenant accents do not require reloading an unchanged native base.
		if (loadedThemes.get(this.document) === theme) return
		await setTheme(theme)
		if (generation !== this.generation) return
		if (!this.fundamental.setTheme(theme)) throw new Error('Unsupported Fundamental theme')
		await Promise.all(
			['hcm-sap-theme', 'hcm-fundamental-theme'].map(
				/** Wait for each link created by the maintained theming service. */ (id) =>
					this.waitForStylesheet(id),
			),
		)
		if (generation === this.generation) loadedThemes.set(this.document, theme)
	}

	/** Remove owned stylesheet links when this document no longer has an HCM theme owner. */
	clear(): void {
		this.generation++
		loadedThemes.delete(this.document)
		for (const cancel of this.pendingLoads) cancel()
		for (const id of ['hcm-sap-theme', 'hcm-fundamental-theme'])
			this.document.getElementById(id)?.remove()
	}

	/** Reject failed or stalled stylesheet loads rather than claiming a partially applied theme. */
	private waitForStylesheet(id: string): Promise<void> {
		const link = this.document.getElementById(id) as HTMLLinkElement | null
		if (!link) return Promise.reject(new Error('Missing native theme stylesheet'))
		// A browser can retain the previous sheet while an updated href is still loading.
		if (link.sheet?.href === link.href) return Promise.resolve()
		return new Promise<void>(
			/** Settle once and release listeners on success, error or timeout. */ (resolve, reject) => {
				const finish = /** Release pending browser listeners before completing the load. */ (
					error?: Error,
				): void => {
					clearTimeout(timeout)
					this.pendingLoads.delete(cancel)
					link.removeEventListener('load', loaded)
					link.removeEventListener('error', failed)
					if (error) reject(error)
					else resolve()
				}
				const loaded = /** Confirm the local stylesheet is available. */ (): void => finish()
				const failed = /** Report a missing or rejected native theme asset. */ (): void =>
					finish(new Error('Native theme stylesheet failed'))
				const cancel =
					/** Release an obsolete owner immediately so its successor can load. */ (): void =>
						finish(new Error('Native theme owner was destroyed'))
				const timeout = setTimeout(
					/** Bound a stalled asset request. */ () =>
						finish(new Error('Native theme stylesheet timed out')),
					15000,
				)
				link.addEventListener('load', loaded, { once: true })
				link.addEventListener('error', failed, { once: true })
				this.pendingLoads.add(cancel)
			},
		)
	}
}
