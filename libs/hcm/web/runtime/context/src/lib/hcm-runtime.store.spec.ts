import { TestBed } from '@angular/core/testing'
import { HcmRuntimeStore } from './hcm-runtime.store'

describe('HcmRuntimeStore', /** Verify isolated fixture mutations and presentation preferences. */ () => {
	it('keeps branding and preferences when the mock principal changes', /** Exercise independent fixture controls without losing tenant context. */ () => {
		const store = TestBed.inject(HcmRuntimeStore)
		store.updatePreferences({ theme: 'horizon-dark', locale: 'en-GB' })
		store.setPrimaryColor('#0055aa')
		store.toggleRole('manager')
		store.toggleEntitlement('leave')
		expect(store.roles().has('manager')).toBe(false)
		expect(store.entitlements().has('leave')).toBe(false)
		expect(store.preferences()).toEqual({ theme: 'horizon-dark', locale: 'en-GB' })
		expect(store.tenant().primaryColor).toBe('#0055aa')
		store.resetFixture()
		expect(store.roles().has('manager')).toBe(true)
		expect(store.entitlements().has('leave')).toBe(true)
		expect(store.preferences()).toEqual({})
		expect(store.tenant().primaryColor).toBeUndefined()
	})
})
