import { TestBed } from '@angular/core/testing'
import { signal } from '@angular/core'
import { HcmThemeService, normalizeHexColor } from '@empflowyee/hcm-web-ux-theme'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { ThemeLabComponent } from './theme-lab.component'

describe('Theme Lab controls', /** Verify fixture branding and preferences without loading UI5 assets. */ () => {
	it('keeps invalid drafts from changing the tenant and clears accepted branding', /** Exercise acceptance, rejection, clearing and persistent user theme selection. */ () => {
		const primary = signal<string | null>(null)
		const theme = {
			tenantPrimary: primary.asReadonly(),
			setTenantPrimary: /** Simulate the same strict color boundary used by the theme engine. */ (
				value: string,
			) => {
				const normalized = normalizeHexColor(value)
				if (!normalized) return false
				primary.set(normalized)
				return true
			},
			clearTenantPrimary: /** Restore the absence of an accent. */ () => primary.set(null),
		}
		TestBed.configureTestingModule({ providers: [{ provide: HcmThemeService, useValue: theme }] })
		const lab = TestBed.runInInjectionContext(
			/** Construct the lab in Angular's signal-form injection context. */ () =>
				new ThemeLabComponent(),
		)
		const runtime = TestBed.inject(HcmRuntimeStore)
		lab.onPrimaryColor('#ABC')
		expect(runtime.tenant().primaryColor).toBe('#aabbcc')
		lab.onPrimaryColor('var(--untrusted)')
		expect(runtime.tenant().primaryColor).toBe('#aabbcc')
		expect(lab.colorError()).not.toBeNull()
		lab.selectTheme('her-dark')
		lab.clearPrimary()
		expect(runtime.tenant().primaryColor).toBeUndefined()
		expect(runtime.preferences().theme).toBe('her-dark')
		expect(lab.colorModel().primary).toBe('')
	})
})
