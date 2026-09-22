import { TestBed } from '@angular/core/testing'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import { HcmThemeService } from '@empflowyee/hcm-web-ux-theme'
import { HcmShellComponent } from './hcm-shell.component'

describe('HCM shell composition', /** Verify visible selection and preference precedence without network assets. */ () => {
	it('falls back from a hidden Space and preserves user theme preferences', /** Change roles after selecting Administration and apply tenant/user defaults. */ () => {
		const theme = { setVariant: vi.fn(), setTenantPrimary: vi.fn() }
		TestBed.configureTestingModule({ providers: [{ provide: HcmThemeService, useValue: theme }] })
		const shell = TestBed.runInInjectionContext(
			/** Construct the shell with real fixture context and an isolated theme adapter. */ () =>
				new HcmShellComponent(),
		)
		const runtime = TestBed.inject(HcmRuntimeStore)
		runtime.updatePreferences({ theme: 'horizon-dark' })
		TestBed.tick()
		expect(theme.setVariant).toHaveBeenLastCalledWith('horizon-dark')
		shell.selectSpace('administration')
		runtime.toggleRole('tenant-super-admin')
		expect(shell.activeSpace()?.id).toBe('employee')
		for (const role of runtime.principal().roles) runtime.toggleRole(role)
		expect(shell.activeSpace()).toBeUndefined()
	})
})
