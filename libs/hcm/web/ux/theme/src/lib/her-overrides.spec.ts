import { TestBed } from '@angular/core/testing'
import { expect, it, vi } from 'vitest'
import { HcmNativeThemeService } from './hcm-native-theme.service'
import { HcmThemeService } from './hcm-theme.service'

it('keeps HER drafts inactive on Horizon and restores them only in HER', /** Verify cleanup, native parameter bridging and draft retention in one document. */ async () => {
	TestBed.configureTestingModule({
		providers: [
			{
				provide: HcmNativeThemeService,
				useValue: { apply: vi.fn().mockResolvedValue(undefined), clear: vi.fn() },
			},
		],
	})
	const theme = TestBed.inject(HcmThemeService)
	theme.setHerOverrides({ '--ef-surface-base': '#332211', '--ef-text-strong': '#ffffff' })
	theme.setVariant('her-dark')
	TestBed.tick()
	await theme.whenSettled()
	expect(document.documentElement.style.getPropertyValue('--sapGroup_ContentBackground')).toBe(
		'#332211',
	)
	theme.setVariant('horizon-light')
	TestBed.tick()
	await theme.whenSettled()
	expect(document.documentElement.style.getPropertyValue('--ef-surface-base')).toBe('')
	expect(document.documentElement.style.getPropertyValue('--sapGroup_ContentBackground')).toBe('')
	expect(theme.herOverrides()['--ef-surface-base']).toBe('#332211')
	theme.setVariant('her-light')
	TestBed.tick()
	await theme.whenSettled()
	expect(document.documentElement.style.getPropertyValue('--ef-surface-base')).toBe('#332211')
	theme.setHerOverrides({})
	TestBed.tick()
	await theme.whenSettled()
	expect(document.documentElement.style.getPropertyValue('--ef-surface-base')).toBe('')
	TestBed.resetTestingModule()
})
