import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router, provideRouter } from '@angular/router'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { HcmThemeService } from '@empflowyee/hcm-web-ux-theme'
import { HcmShellComponent } from './hcm-shell.component'

vi.mock(
	'@ui5/webcomponents-base/dist/config/Language.js',
	/** Isolate UI5 asset loading while testing shell composition. */ () => ({
		setLanguage: vi.fn().mockResolvedValue(undefined),
	}),
)

it('composes resolved presentation and global search without owning launchpad state', /** Verify shell composition without a fake production session setter. */ async () => {
	const theme = { setVariant: vi.fn(), setTenantPrimary: vi.fn() }
	const context = signal({
		preferences: { theme: 'horizon-dark' as const },
		access: {
			roles: ['employee'],
			permissions: ['hcm.catalogue.MY_PROFILE.discover'],
			entitlements: ['hcm.employee'],
			featureFlags: ['shell-preview'],
		},
	})
	TestBed.configureTestingModule({
		providers: [
			provideRouter([{ path: '', children: [] }]),
			{ provide: HcmThemeService, useValue: theme },
			{
				provide: HcmRuntimeStore,
				useValue: {
					context,
					tenant: /** Expose the safe tenant branding projection. */ () => ({
						primaryColor: '#0055aa',
					}),
					preferences: /** Supply previously resolved user preferences. */ () => ({
						theme: 'horizon-dark',
						language: 'en',
						density: 'compact',
					}),
					ensureLoaded: vi.fn().mockResolvedValue(undefined),
				},
			},
		],
	})
	await TestBed.inject(Router).navigateByUrl('/')
	const shell = TestBed.runInInjectionContext(
		/** Construct the shell against isolated presentation adapters. */ () =>
			new HcmShellComponent(),
	)
	TestBed.tick()
	expect(theme.setVariant).toHaveBeenLastCalledWith('horizon-dark')
	expect(theme.setTenantPrimary).toHaveBeenLastCalledWith('#0055aa')
	await shell.applications.search('MY_PROFILE')
	expect(shell.applications.query()).toBe('MY_PROFILE')
})
