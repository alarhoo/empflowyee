import { DOCUMENT } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { Router, RouterLink, RouterOutlet } from '@angular/router'
import { ShellBarBranding } from '@fundamental-ngx/ui5-webcomponents-fiori/shell-bar-branding'
import { ShellBar } from '@fundamental-ngx/ui5-webcomponents-fiori/shell-bar'
import { ShellBarItem } from '@fundamental-ngx/ui5-webcomponents-fiori/shell-bar-item'
import '@ui5/webcomponents-icons/dist/light-mode.js'
import '@ui5/webcomponents-icons/dist/dark-mode.js'
import { Page } from '@fundamental-ngx/ui5-webcomponents-fiori/page'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Avatar } from '@fundamental-ngx/ui5-webcomponents/avatar'
import { BusyIndicator } from '@fundamental-ngx/ui5-webcomponents/busy-indicator'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { ContentDensityDirective, ContentDensityMode } from '@fundamental-ngx/core/content-density'
import { setLanguage } from '@ui5/webcomponents-base/dist/config/Language.js'
import { HcmRuntimeStore, HcmApplicationNavigation } from '@empflowyee/hcm-web-runtime-context'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'

import { HcmAppearanceMenuComponent } from './hcm-appearance-menu.component'
import { HcmProfileMenuComponent } from './hcm-profile-menu.component'

import { HcmThemeService, HcmAppearanceService } from '@empflowyee/hcm-web-ux-theme'

@Component({
	selector: 'ef-hcm-shell',
	imports: [
		Input,

		HcmProfileMenuComponent,
		HcmAppearanceMenuComponent,
		RouterOutlet,
		RouterLink,
		ShellBar,
		ShellBarItem,
		ShellBarBranding,
		Page,
		Bar,
		Title,
		Button,
		Avatar,
		BusyIndicator,
		MessageStrip,
		ContentDensityDirective,
	],
	templateUrl: './hcm-shell.component.html',
	styleUrl: './hcm-shell.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HcmShellComponent {
	readonly runtime = inject(HcmRuntimeStore)
	readonly theme = inject(HcmThemeService)
	readonly appearance = inject(HcmAppearanceService)
	private readonly router = inject(Router)
	private readonly document = inject(DOCUMENT)
	private readonly navigation = toSignal(this.router.events)
	readonly lab = computed(
		/** Keep the independent developer lab outside production shell bootstrap. */ () => {
			this.navigation()
			const target = this.router.currentNavigation()?.extractedUrl.toString() ?? this.router.url
			return target.startsWith('/ux/theme-lab')
		},
	)
	readonly denied = computed(
		/** Render the dedicated access-denied route without loading a business feature. */ () => {
			this.navigation()
			return this.router.url.startsWith('/access-denied')
		},
	)
	readonly localeError = signal(false)
	readonly fullBleed = computed(
		/** Allow approved screens to frame their content inside a full-width native page. */ () => {
			this.navigation()
			return this.router.routerState.snapshot.root.firstChild?.data['fullBleed'] === true
		},
	)
	readonly densityMode = computed(
		/** Scope native density to production content instead of mutating the independent lab. */ () =>
			this.runtime.preferences().density === 'compact'
				? ContentDensityMode.COMPACT
				: ContentDensityMode.COZY,
	)
	readonly userInitials = computed(
		/** Derive presentation initials from the authenticated display name. */ () =>
			(this.runtime.context()?.user.displayName ?? '')
				.split(/\s+/)
				.slice(0, 2)
				.map(/** Select one letter from each display-name part. */ (part) => part[0] ?? '')
				.join('')
				.toUpperCase(),
	)
	readonly applications = inject(HcmApplicationNavigation)
	readonly appearanceOpen = signal(false)
	readonly appearanceOpener = signal<HTMLElement | null>(null)
	readonly profileOpen = signal(false)
	readonly profileOpener = signal<HTMLElement | null>(null)
	readonly loginPath = computed(
		/** Accept only a same-origin authentication boundary path. */ () => {
			const state = this.runtime.state()
			const path =
				state.kind === 'auth-required' ? state.discovery.authentication.loginPath : undefined
			return path && /^\/api\/v1\/auth\/[a-zA-Z0-9/_-]+$/.test(path) ? path : undefined
		},
	)

	/** Start remote bootstrap after Angular initialization and compose the approved presentation services. */
	constructor() {
		effect(
			/** Start production runtime only outside the independent developer tool. */ () => {
				if (!this.lab() && (this.router.navigated || this.router.currentNavigation()))
					void this.runtime.ensureLoaded()
			},
		)
		effect(
			/** Resolve theme, branding, language and supported native density from runtime preferences. */ () => {
				if (this.lab() || (!this.router.navigated && !this.router.currentNavigation())) return
				const preferences = this.runtime.preferences()
				this.theme.setVariant(
					this.appearance.resolve(
						preferences.theme,
						this.runtime.context()?.preferences?.theme,
						this.runtime.tenant()?.allowUserTheme,
					),
				)
				this.theme.setTenantPrimary(null)
				this.theme.setTenantPrimary(this.runtime.tenant()?.primaryColor ?? null)
				this.document.documentElement.lang = preferences.language
				void setLanguage(preferences.language)
					.then(/** Clear a previous locale asset failure. */ () => this.localeError.set(false))
					.catch(
						/** Show a safe error while retaining the resolved presentation context. */ () =>
							this.localeError.set(true),
					)
			},
		)
	}

	/** Retry discovery/session and restore a safe local route requested before authentication. */
	async retry(): Promise<void> {
		await this.runtime.refresh()
		const returnTo = this.router.parseUrl(this.router.url).queryParams['returnTo'] as unknown
		if (
			this.runtime.context() &&
			typeof returnTo === 'string' &&
			/^\/[a-zA-Z0-9/_-]*$/.test(returnTo)
		)
			await this.router.navigateByUrl(returnTo)
	}
	/** Hand off to a configured server authentication adapter without accepting external redirect URLs. */
	login(): void {
		const path = this.loginPath()
		if (path) this.document.location.assign(path)
	}
}
