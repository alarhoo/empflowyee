import { TestBed } from '@angular/core/testing'
import { expect, it, vi } from 'vitest'
import { HcmThemeService } from '@empflowyee/hcm-web-ux-theme'
import { ThemingService } from '@fundamental-ngx/core/theming'
import { LabSettingsStore } from './lab-settings.store'

vi.mock(
	'@ui5/webcomponents-base/dist/config/Theme.js',
	/** Avoid network assets in the workshop state test. */ () => ({
		setTheme: vi.fn().mockResolvedValue(undefined),
	}),
)

it('imports atomically and resets tokens independently from tenant branding', /** Exercise the workshop using the real validated theme service without browser asset loading. */ async () => {
	TestBed.configureTestingModule({
		providers: [
			LabSettingsStore,
			{
				provide: ThemingService,
				useValue: {
					setTheme: /** Model already loaded local stylesheet assets. */ () => {
						for (const id of ['hcm-sap-theme', 'hcm-fundamental-theme']) {
							const link = document.createElement('link')
							link.id = id
							Object.defineProperty(link, 'sheet', { value: { href: link.href } })
							document.head.append(link)
						}
						return true
					},
				},
			},
		],
	})
	const settings = TestBed.inject(LabSettingsStore)
	const theme = TestBed.inject(HcmThemeService)
	expect(
		settings.importJson(
			'{"schemaVersion":1,"base":"her-dark","tenantPrimary":"#663399","tokens":{"--ef-text-strong":"#eeeeee"}}',
		),
	).toBe(true)
	TestBed.tick()
	await theme.whenSettled()
	expect(settings.changedCount()).toBe(1)
	const previous = settings.exportJson()
	expect(
		settings.importJson(
			'{"schemaVersion":1,"base":"her-light","tenantPrimary":null,"tokens":{"--unsafe":"url(x)"}}',
		),
	).toBe(false)
	expect(settings.exportJson()).toBe(previous)
	settings.resetTokens()
	expect(settings.changedCount()).toBe(0)
	expect(theme.tenantPrimary()).toBe('#663399')
	theme.clearTenantPrimary()
	expect(theme.tenantPrimary()).toBeNull()
	TestBed.resetTestingModule()
})
