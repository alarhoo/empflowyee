import { TestBed } from '@angular/core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js'
import { HcmThemeService } from './hcm-theme.service'

vi.mock(
	'@ui5/webcomponents-base/dist/config/Theme.js',
	/** Isolate theme orchestration from network asset loading. */ () => ({
		setTheme: vi.fn(/** Simulate a successfully loaded native UI5 theme. */ async () => undefined),
	}),
)

describe('HcmThemeService', /** Verify family changes, async ordering and complete accent cleanup. */ () => {
	beforeEach(
		/** Reset the DOM and native theme adapter between scenarios. */ () => {
			TestBed.resetTestingModule()
			document.documentElement.removeAttribute('style')
			vi.mocked(setTheme).mockReset()
			vi.mocked(setTheme).mockResolvedValue(undefined)
		},
	)
	it('switches native themes and clears all branding when returning to Horizon', /** Ensure an invalid color never replaces the accepted overlay. */ async () => {
		const service = TestBed.inject(HcmThemeService)
		service.setVariant('her-dark')
		expect(service.setTenantPrimary('#abc')).toBe(true)
		TestBed.tick()
		await service.whenSettled()
		expect(setTheme).toHaveBeenLastCalledWith('sap_horizon_dark')
		expect(document.documentElement.dataset['hcmThemeVariant']).toBe('her-dark')
		expect(
			document.documentElement.style.getPropertyValue('--sapButton_Emphasized_Background'),
		).toBe('#aabbcc')
		expect(service.setTenantPrimary('red;display:none')).toBe(false)
		expect(service.tenantPrimary()).toBe('#aabbcc')
		service.clearTenantPrimary()
		service.setVariant('horizon-light')
		TestBed.tick()
		await service.whenSettled()
		expect(document.documentElement.style.getPropertyValue('--ef-color-accent')).toBe('')
		expect(document.documentElement.style.getPropertyValue('--sapBrandColor')).toBe('')
		expect(
			document.documentElement.style.getPropertyValue('--sapButton_Emphasized_Hover_TextColor'),
		).toBe('')
		expect(document.documentElement.style.colorScheme).toBe('light')
	})
	it('finishes on the latest requested variant during an in-flight theme load', /** Delay the first asset request to expose ordering regressions. */ async () => {
		let complete: (() => void) | undefined
		vi.mocked(setTheme).mockImplementationOnce(
			/** Hold the old native theme request until another selection arrives. */ () =>
				new Promise<void>(
					/** Capture completion under test control. */ (resolve) => {
						complete = resolve
					},
				),
		)
		const service = TestBed.inject(HcmThemeService)
		service.setVariant('horizon-dark')
		TestBed.tick()
		await Promise.resolve()
		service.setVariant('her-light')
		TestBed.tick()
		complete?.()
		await service.whenSettled()
		expect(setTheme).toHaveBeenLastCalledWith('sap_horizon')
		expect(document.documentElement.dataset['hcmThemeVariant']).toBe('her-light')
	})
	it('reports asset errors and recovers on a later variant', /** Keep loading failures handled and permit a subsequent successful selection. */ async () => {
		vi.mocked(setTheme).mockRejectedValueOnce(new Error('asset unavailable'))
		const service = TestBed.inject(HcmThemeService)
		TestBed.tick()
		await service.whenSettled()
		expect(service.error()).toContain('Theme assets')
		service.setVariant('horizon-dark')
		TestBed.tick()
		await service.whenSettled()
		expect(service.error()).toBeNull()
	})
})
