import { ApplicationInitStatus, Component } from '@angular/core'
import { DeferBlockState } from '@angular/core/testing'
import { TestBed } from '@angular/core/testing'
import { HcmShellComponent } from '@empflowyee/hcm-web-shell'
import { App } from './app'
import { provideRuntimeConfig, RUNTIME_CONFIG } from '@empflowyee/platform-web-runtime-shell'
import { parseHcmBrowserRuntimeConfig } from '@empflowyee/hcm-web-runtime-context'

@Component({ selector: 'ef-hcm-shell', template: 'Production shell boundary' })
class ShellBoundary {}

it('composes a full-width shell with content framing delegated to routed screens', /** Keep the application root free of business implementation and viewport width constraints. */ async () => {
	TestBed.configureTestingModule({ imports: [App] }).overrideComponent(App, {
		remove: { imports: [HcmShellComponent] },
		add: { imports: [ShellBoundary] },
	})
	await TestBed.compileComponents()
	const fixture = TestBed.createComponent(App)
	fixture.detectChanges()
	const blocks = await fixture.getDeferBlocks()
	await blocks[0].render(DeferBlockState.Complete)
	const root = fixture.nativeElement as HTMLElement
	expect(root.querySelector('ef-hcm-shell')).not.toBeNull()
	expect(root.classList.contains('hcm-app-canvas')).toBe(false)
})

it('initializes only local deployment configuration before consumers request it', /** Prove the app initializer never waits for tenant discovery or authenticated remote state. */ async () => {
	const fetchConfig = vi
		.spyOn(globalThis, 'fetch')
		.mockResolvedValue(
			Response.json({ environment: 'local', releaseId: 'test', apiBaseUrl: '/api' }),
		)
	try {
		TestBed.configureTestingModule({
			providers: [...provideRuntimeConfig(parseHcmBrowserRuntimeConfig)],
		})
		const initialization = TestBed.inject(ApplicationInitStatus)
		await initialization.donePromise
		expect(TestBed.inject(RUNTIME_CONFIG).apiBaseUrl).toBe('/api')
		expect(fetchConfig).toHaveBeenCalledOnce()
		expect(fetchConfig).toHaveBeenCalledWith(
			'/assets/config.json',
			expect.objectContaining({ cache: 'no-store' }),
		)
	} finally {
		fetchConfig.mockRestore()
	}
})
