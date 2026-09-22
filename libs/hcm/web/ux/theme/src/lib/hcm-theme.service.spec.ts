import { TestBed } from '@angular/core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HcmNativeThemeService } from './hcm-native-theme.service'
import { HcmThemeService } from './hcm-theme.service'

describe('HcmThemeService', /** Verify applied state, invalidation and document ownership independently of browser assets. */ () => {
	const apply = vi.fn<(theme: 'sap_horizon' | 'sap_horizon_dark') => Promise<void>>()
	const clear = vi.fn()
	beforeEach(
		/** Give each scenario a fresh root owner and native-loader substitute. */ () => {
			TestBed.resetTestingModule()
			document.documentElement.removeAttribute('style')
			apply.mockReset().mockResolvedValue(undefined)
			clear.mockReset()
			TestBed.configureTestingModule({
				providers: [{ provide: HcmNativeThemeService, useValue: { apply, clear } }],
			})
		},
	)
	it('starts unbranded Horizon and clears every inline override on family changes', /** Invalid tenant CSS must never replace an accepted color. */ async () => {
		const service = TestBed.inject(HcmThemeService)
		expect(service.variant()).toBe('horizon-light')
		expect(service.appliedVariant()).toBeNull()
		service.setVariant('her-dark')
		expect(service.setTenantPrimary('#abc')).toBe(true)
		TestBed.tick()
		await service.whenSettled()
		expect(apply).toHaveBeenLastCalledWith('sap_horizon_dark')
		expect(service.appliedVariant()).toBe('her-dark')
		expect(document.documentElement.style.getPropertyValue('--sapBrandColor')).toBe('#aabbcc')
		expect(service.setTenantPrimary('red;display:none')).toBe(false)
		expect(service.tenantPrimary()).toBe('#aabbcc')
		service.clearTenantPrimary()
		service.setVariant('horizon-light')
		TestBed.tick()
		await service.whenSettled()
		expect(document.documentElement.getAttribute('style')).toBe('color-scheme: light;')
		expect(service.appliedVariant()).toBe('horizon-light')
		expect(service.loading()).toBe(false)
	})
	it('finishes on the latest request during an in-flight native load', /** Delayed native loading must not apply the superseded semantic palette. */ async () => {
		let complete: (() => void) | undefined
		apply.mockImplementationOnce(
			/** Hold the first load under test control. */ () =>
				new Promise<void>(
					/** Capture the deferred completion. */ (resolve) => {
						complete = resolve
					},
				),
		)
		const service = TestBed.inject(HcmThemeService)
		service.setVariant('horizon-dark')
		TestBed.tick()
		await Promise.resolve()
		expect(service.loading()).toBe(true)
		service.setVariant('her-light')
		TestBed.tick()
		complete?.()
		await service.whenSettled()
		expect(apply).toHaveBeenLastCalledWith('sap_horizon')
		expect(service.appliedVariant()).toBe('her-light')
		expect(document.documentElement.dataset['hcmThemeVariant']).toBe('her-light')
	})
	it('reports a failed selection separately from the last applied variant', /** An asset error cannot falsely report a successful theme switch. */ async () => {
		const service = TestBed.inject(HcmThemeService)
		TestBed.tick()
		await service.whenSettled()
		apply.mockRejectedValueOnce(new Error('asset unavailable'))
		service.setVariant('her-dark')
		TestBed.tick()
		await service.whenSettled()
		expect(service.variant()).toBe('her-dark')
		expect(service.appliedVariant()).toBe('horizon-light')
		expect(service.error()).toContain('Theme assets')
		expect(service.loading()).toBe(false)
		service.setVariant('horizon-dark')
		TestBed.tick()
		await service.whenSettled()
		expect(service.error()).toBeNull()
		expect(service.appliedVariant()).toBe('horizon-dark')
	})
	it('releases family selectors and owned styles when destroyed', /** Story remounts must not inherit an orphaned HER palette. */ async () => {
		const service = TestBed.inject(HcmThemeService)
		service.setVariant('her-light')
		service.setTenantPrimary('#123456')
		TestBed.tick()
		await service.whenSettled()
		TestBed.resetTestingModule()
		const root = document.documentElement
		expect(root.dataset['hcmThemeFamily']).toBeUndefined()
		expect(root.dataset['hcmThemeVariant']).toBeUndefined()
		expect(root.dataset['hcmThemeLoading']).toBeUndefined()
		expect(root.style.length).toBe(0)
		expect(clear).toHaveBeenCalledOnce()
	})
})
