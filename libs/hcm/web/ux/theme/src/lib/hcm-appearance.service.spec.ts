import { TestBed } from '@angular/core/testing'
import { HcmAppearanceService } from './hcm-appearance.service'

afterEach(
	/** Release media listeners and isolate each browser preference test. */ () => {
		TestBed.resetTestingModule()
		localStorage.clear()
		vi.unstubAllGlobals()
	},
)

it('follows device changes until a full variant overrides them, respecting tenant locks', /** Verify precedence, persistence, tenant lock and live device updates. */ () => {
	const media = Object.assign(new EventTarget(), { matches: true })
	vi.stubGlobal('matchMedia', /** Supply a deterministic device media query. */ () => media)
	const appearance = TestBed.inject(HcmAppearanceService)
	expect(appearance.resolve('horizon-light', undefined)).toBe('horizon-dark')
	media.dispatchEvent(Object.assign(new Event('change'), { matches: false }))
	expect(appearance.resolve('horizon-light', undefined)).toBe('horizon-light')
	appearance.select('her-dark')
	expect(localStorage.getItem('empflowyee.hcm.appearance')).toBe('her-dark')
	expect(appearance.resolve('her-light', undefined)).toBe('her-dark')
	expect(appearance.resolve('horizon-light', undefined, false)).toBe('horizon-light')
	TestBed.resetTestingModule()
	expect(TestBed.inject(HcmAppearanceService).resolve('horizon-light', undefined)).toBe('her-dark')
})

it('ignores corrupt storage and retains explicit server preferences until a local selection', /** Keep storage data from inventing theme variants and preserve approved server choices. */ () => {
	localStorage.setItem('empflowyee.hcm.appearance', 'invalid')
	const appearance = TestBed.inject(HcmAppearanceService)
	expect(appearance.resolve('horizon-light', 'her-dark')).toBe('her-dark')
	appearance.select('horizon-light')
	expect(appearance.resolve('horizon-light', 'her-dark')).toBe('horizon-light')
	appearance.select('invalid')
	expect(appearance.resolve('horizon-light', 'her-dark')).toBe('horizon-light')
})

it('resumes live device changes after an explicit system choice', /** Ensure returning to device mode overrides a previous local or server selection. */ () => {
	const media = Object.assign(new EventTarget(), { matches: false })
	vi.stubGlobal('matchMedia', /** Supply a changeable device media query. */ () => media)
	const appearance = TestBed.inject(HcmAppearanceService)
	appearance.select('her-dark')
	appearance.select('system')
	expect(appearance.resolve('horizon-light', 'her-dark')).toBe('her-light')
	media.dispatchEvent(Object.assign(new Event('change'), { matches: true }))
	expect(appearance.resolve('horizon-light', 'her-light')).toBe('her-dark')
	expect(localStorage.getItem('empflowyee.hcm.appearance')).toBe('system')
})

it('restores legacy mode choices within the server family', /** Preserve existing browser preferences while allowing the next selection to choose a full variant. */ () => {
	localStorage.setItem('empflowyee.hcm.appearance', 'dark')
	const appearance = TestBed.inject(HcmAppearanceService)
	expect(appearance.resolve('her-light', undefined)).toBe('her-dark')
	appearance.select('horizon-light')
	expect(appearance.resolve('her-light', undefined)).toBe('horizon-light')
})
