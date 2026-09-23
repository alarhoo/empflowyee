import { DOCUMENT } from '@angular/common'
import { DestroyRef, Injectable, inject, signal } from '@angular/core'
import { HCM_THEMES, type HcmThemeVariant } from './hcm-theme.models'

const preferenceKey = 'empflowyee.hcm.appearance'

@Injectable({ providedIn: 'root' })
export class HcmAppearanceService {
	private readonly window = inject(DOCUMENT).defaultView
	private readonly deviceDark = signal(false)
	private readonly saved = signal<HcmThemeVariant | 'system' | 'light' | 'dark' | null>(null)
	readonly preference = this.saved.asReadonly()

	/** Observe the device appearance and restore only a validated, non-sensitive local preference. */
	constructor() {
		const media = this.window?.matchMedia?.('(prefers-color-scheme: dark)')
		this.deviceDark.set(media?.matches ?? false)
		try {
			const saved = this.window?.localStorage.getItem(preferenceKey)
			if (saved === 'light' || saved === 'dark' || saved === 'system') this.saved.set(saved)
			else if (
				HCM_THEMES.some(
					/** Accept only supported theme identifiers. */ (theme) => theme.id === saved,
				)
			)
				this.saved.set(saved as HcmThemeVariant)
		} catch {
			/* Storage may be disabled; the in-memory selection still works. */
		}
		/** Follow device changes until the user chooses an explicit appearance. */
		const changed = (event: MediaQueryListEvent): void => this.deviceDark.set(event.matches)
		media?.addEventListener('change', changed)
		inject(DestroyRef).onDestroy(
			/** Release the browser preference listener with the application. */ () =>
				media?.removeEventListener('change', changed),
		)
	}

	/** Resolve explicit variants or live device appearance, respecting locked tenant policy and legacy modes. */
	resolve(base: HcmThemeVariant, user: HcmThemeVariant | undefined, allow = true): HcmThemeVariant {
		if (!allow) return base
		const saved = this.saved()
		if (!saved && user) return user
		const family = (user ?? base).startsWith('her-') ? 'her' : 'horizon'
		if (saved === 'light' || saved === 'dark') return `${family}-${saved}`
		if (saved && saved !== 'system') return saved
		return `${family}-${this.deviceDark() ? 'dark' : 'light'}`
	}

	/** Save an approved full variant or resume following the device without persisting any identity data. */
	select(value: string | null): void {
		if (
			value !== 'system' &&
			!HCM_THEMES.some(/** Validate the requested appearance. */ (theme) => theme.id === value)
		)
			return
		const preference = value as HcmThemeVariant | 'system'
		this.saved.set(preference)
		try {
			this.window?.localStorage.setItem(preferenceKey, preference)
		} catch {
			/* Continue with the session preference when storage is unavailable. */
		}
	}
}
