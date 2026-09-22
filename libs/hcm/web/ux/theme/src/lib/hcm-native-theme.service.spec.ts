import { TestBed } from '@angular/core/testing'
import { ThemingService } from '@fundamental-ngx/core/theming'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HcmNativeThemeService } from './hcm-native-theme.service'

vi.mock(
	'@ui5/webcomponents-base/dist/config/Theme.js',
	/** Isolate document ownership from UI5's asset registry. */ () => ({
		setTheme: vi.fn().mockResolvedValue(undefined),
	}),
)

describe('HcmNativeThemeService', /** Verify failed assets and discarded roots cannot block later theme owners. */ () => {
	const ids = ['hcm-sap-theme', 'hcm-fundamental-theme']
	const setTheme = vi.fn(
		/** Model the maintained loader creating pending stylesheet links. */ () => {
			for (const id of ids) {
				const link = document.createElement('link')
				link.id = id
				document.head.append(link)
			}
			return true
		},
	)
	beforeEach(
		/** Reset the injector and document-owned links between independent lifecycles. */ () => {
			TestBed.resetTestingModule()
			for (const id of ids) document.getElementById(id)?.remove()
			setTheme.mockClear()
			TestBed.configureTestingModule({
				providers: [{ provide: ThemingService, useValue: { setTheme } }],
			})
		},
	)
	it('waits for a changed href even while the browser retains its previous stylesheet', /** Firefox must not expose an applied marker while its native palette is still loading. */ async () => {
		setTheme.mockImplementationOnce(
			/** Simulate retained old sheets during a native theme URL change. */ () => {
				for (const id of ids) {
					const link = document.createElement('link')
					link.id = id
					link.href = 'https://example.test/new.css'
					Object.defineProperty(link, 'sheet', {
						value: { href: 'https://example.test/previous.css' },
					})
					document.head.append(link)
				}
				return true
			},
		)
		const service = TestBed.inject(HcmNativeThemeService)
		let completed = false
		const applied = service.apply('sap_horizon_dark').then(
			/** Record observable completion without inspecting loader internals. */ () => {
				completed = true
			},
		)
		await vi.waitFor(
			/** Wait until both replacement URLs have been assigned. */ () =>
				expect(setTheme).toHaveBeenCalledOnce(),
		)
		expect(completed).toBe(false)
		for (const id of ids) document.getElementById(id)?.dispatchEvent(new Event('load'))
		await applied
		expect(completed).toBe(true)
		await service.apply('sap_horizon_dark')
		expect(setTheme).toHaveBeenCalledOnce()
		service.clear()
	})
	it('rejects a missing stylesheet instead of reporting successful theme application', /** A native link error must reach the semantic theme owner. */ async () => {
		const service = TestBed.inject(HcmNativeThemeService)
		const result = expect(service.apply('sap_horizon')).rejects.toThrow('stylesheet failed')
		await vi.waitFor(
			/** Wait for asynchronous UI5 selection to reach Fundamental loading. */ () =>
				expect(setTheme).toHaveBeenCalledOnce(),
		)
		document.getElementById(ids[0])?.dispatchEvent(new Event('error'))
		document.getElementById(ids[1])?.dispatchEvent(new Event('load'))
		await result
		service.clear()
	})
	it('releases abandoned loads immediately so the next Angular root can apply its theme', /** A remount must not wait for the previous owner's 15-second asset timeout. */ async () => {
		const previous = TestBed.inject(HcmNativeThemeService)
		const abandoned = expect(previous.apply('sap_horizon_dark')).rejects.toThrow(
			'owner was destroyed',
		)
		await vi.waitFor(
			/** Wait until the old owner is waiting for stylesheet events. */ () =>
				expect(setTheme).toHaveBeenCalledOnce(),
		)
		previous.clear()
		await abandoned
		const next = TestBed.runInInjectionContext(
			/** Construct the replacement document owner with the same maintained dependencies. */ () =>
				new HcmNativeThemeService(),
		)
		const applied = next.apply('sap_horizon')
		await vi.waitFor(
			/** Prove the global native queue progressed to the new owner. */ () =>
				expect(setTheme).toHaveBeenCalledTimes(2),
		)
		for (const id of ids) document.getElementById(id)?.dispatchEvent(new Event('load'))
		await applied
		next.clear()
	})
})
