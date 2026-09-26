import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { HcmRuntimeStore, HcmApplicationNavigation } from '@empflowyee/hcm-web-runtime-context'
import { HcmLaunchpadState } from './hcm-launchpad.state'

it('projects persona access and recovers permitted page selections without granting inspection rights', /** Exercise the lazy screen against changing global session and search context. */ () => {
	const context = signal({
		access: {
			roles: ['employee'],
			permissions: ['hcm.catalogue.MY_PROFILE.discover'],
			entitlements: ['hcm.employee'],
			featureFlags: [],
		},
		development: { catalogueInspection: true },
	})
	TestBed.configureTestingModule({
		providers: [
			provideRouter([]),
			HcmLaunchpadState,
			{ provide: HcmRuntimeStore, useValue: { context } },
		],
	})
	const state = TestBed.inject(HcmLaunchpadState)
	const navigation = TestBed.inject(HcmApplicationNavigation)
	expect(state.activeSpace()?.id).toBe('employee')
	expect(state.applicationCount()).toBe(1)
	navigation.inspectAll.set(true)
	expect(state.spaces()).toHaveLength(5)
	expect(state.applicationCount()).toBe(171)
	state.selectSpace('tenant-administration')
	navigation.inspectAll.set(false)
	expect(state.activeSpace()?.id).toBe('employee')
	navigation.query.set('MY_PROFILE')
	expect(
		state.results().map(/** Select searchable catalogue codes. */ (app) => app.id),
	).toHaveLength(1)
	context.set({
		access: { roles: [], permissions: [], entitlements: [], featureFlags: [] },
		development: { catalogueInspection: false },
	})
	navigation.inspectAll.set(true)
	expect(state.spaces()).toHaveLength(0)
	expect(state.inspecting()).toBe(false)
})
