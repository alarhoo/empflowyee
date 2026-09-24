import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { signal } from '@angular/core'
import { expect, it, vi } from 'vitest'
import { HcmRuntimeStore } from './hcm-runtime.store'
import { HcmApplicationNavigation } from './hcm-application-navigation'

it('switches persona at the existing launchpad without mistaking skipped navigation for cancellation', /** Preserve the default local persona selector on an already active home route. */ async () => {
	const selectDevelopmentPersona = vi.fn(),
		navigateByUrl = vi.fn().mockResolvedValue(false)
	TestBed.configureTestingModule({
		providers: [
			{ provide: Router, useValue: { url: '/', navigateByUrl } },
			{ provide: HcmRuntimeStore, useValue: { context: signal(null), selectDevelopmentPersona } },
		],
	})
	await TestBed.inject(HcmApplicationNavigation).selectPersona('david')
	expect(navigateByUrl).not.toHaveBeenCalled()
	expect(selectDevelopmentPersona).toHaveBeenCalledWith('david')
})

it('keeps the current persona when a dirty feature cancels navigation', /** Honor the feature leave guard before replacing the server session. */ async () => {
	const selectDevelopmentPersona = vi.fn(),
		navigateByUrl = vi.fn().mockResolvedValue(false)
	TestBed.configureTestingModule({
		providers: [
			{ provide: Router, useValue: { url: '/access-control/role-management', navigateByUrl } },
			{ provide: HcmRuntimeStore, useValue: { context: signal(null), selectDevelopmentPersona } },
		],
	})
	const navigation = TestBed.inject(HcmApplicationNavigation)
	await navigation.selectPersona('jim')
	expect(navigateByUrl).toHaveBeenCalledWith('/')
	expect(selectDevelopmentPersona).not.toHaveBeenCalled()
	navigateByUrl.mockResolvedValue(true)
	await navigation.selectPersona('jim')
	expect(selectDevelopmentPersona).toHaveBeenCalledWith('jim')
})

it('retains Space and Page while honoring a cancelled back request', /** A lazy launchpad revisit must not silently reset to Employee or discard a blocked search. */ async () => {
	const navigateByUrl = vi.fn().mockResolvedValue(false)
	TestBed.configureTestingModule({
		providers: [
			{ provide: Router, useValue: { url: '/access-control/role-management', navigateByUrl } },
			{ provide: HcmRuntimeStore, useValue: { context: signal(null) } },
		],
	})
	const navigation = TestBed.inject(HcmApplicationNavigation)
	navigation.selectedSpaceId.set('administration')
	navigation.selectedPageId.set('access')
	navigation.query.set('role')
	await navigation.back()
	expect(navigation.query()).toBe('role')
	navigateByUrl.mockResolvedValue(true)
	await navigation.back()
	expect(navigation.selectedSpaceId()).toBe('administration')
	expect(navigation.selectedPageId()).toBe('access')
	expect(navigation.query()).toBe('')
})
it('never signs out through a cancelled dirty-route transition', /** Sign-out must preserve the same data-loss guard as normal app navigation. */ async () => {
	const navigateByUrl = vi.fn().mockResolvedValue(false),
		signOutDevelopment = vi.fn()
	TestBed.configureTestingModule({
		providers: [
			{ provide: Router, useValue: { url: '/access-control/role-management/new', navigateByUrl } },
			{
				provide: HcmRuntimeStore,
				useValue: { context: signal({ development: {} }), signOutDevelopment },
			},
		],
	})
	await TestBed.inject(HcmApplicationNavigation).signOut()
	expect(signOutDevelopment).not.toHaveBeenCalled()
	navigateByUrl.mockResolvedValue(true)
	await TestBed.inject(HcmApplicationNavigation).signOut()
	expect(signOutDevelopment).toHaveBeenCalledOnce()
})
