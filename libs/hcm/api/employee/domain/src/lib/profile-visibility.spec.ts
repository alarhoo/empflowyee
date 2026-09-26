import { describe, expect, it } from 'vitest'
import type { ProfileFieldPolicyDto } from '@empflowyee/hcm-employee-contract'
import {
	effectiveVisibility,
	narrowestVisibility,
	relationSees,
	requireTenantNarrowing,
	sensitivityCeiling,
} from './profile-visibility'

const organization: ProfileFieldPolicyDto = {
	requiredness: 'Optional',
	visibility: 'Organization',
	selfEditMode: 'Direct',
	allowWorkerPreference: true,
}

describe('profile visibility', /** Pure visibility rules. */ () => {
	it('orders audiences cumulatively', /** Self sees everything; Organization only Organization. */ () => {
		expect(relationSees('Self', 'Self')).toBe(true)
		expect(relationSees('Hr', 'Self')).toBe(false)
		expect(relationSees('Hr', 'Manager')).toBe(true)
		expect(relationSees('Manager', 'Hr')).toBe(false)
		expect(relationSees('Organization', 'Manager')).toBe(false)
		expect(relationSees('Organization', 'Organization')).toBe(true)
		expect(narrowestVisibility('Organization', null, 'Manager', 'Hr')).toBe('Hr')
		expect(sensitivityCeiling('Personal')).toBe('Manager')
		expect(sensitivityCeiling('Restricted')).toBe('Hr')
	})

	it('takes the narrowest of ceiling, default, tenant and an allowed preference', /** The preference only narrows where allowed. */ () => {
		const base = {
			ceiling: 'Organization' as const,
			productDefault: organization,
			tenantPolicy: null,
		}
		expect(effectiveVisibility({ ...base, preference: null })).toBe('Organization')
		expect(effectiveVisibility({ ...base, preference: 'Manager' })).toBe('Manager')
		expect(
			effectiveVisibility({
				...base,
				tenantPolicy: { ...organization, visibility: 'Hr', allowWorkerPreference: false },
				preference: 'Self',
			}),
		).toBe('Hr')
		expect(
			effectiveVisibility({
				...base,
				tenantPolicy: { ...organization, requiredness: 'Hidden' },
				preference: null,
			}),
		).toBeNull()
		expect(effectiveVisibility({ ...base, ceiling: 'Hr', preference: null })).toBe('Hr')
	})

	it('rejects tenant policies that widen the product baseline', /** Field errors name every widened attribute. */ () => {
		const required = {
			...organization,
			requiredness: 'Required' as const,
			selfEditMode: 'ServiceRequest' as const,
			allowWorkerPreference: false,
		}
		expect(
			/** Narrowing is accepted. */ () =>
				requireTenantNarrowing('Hr', required, { ...required, visibility: 'Hr' }),
		).not.toThrow()
		try {
			requireTenantNarrowing('Hr', required, {
				requiredness: 'Optional',
				visibility: 'Manager',
				selfEditMode: 'Direct',
				allowWorkerPreference: true,
			})
			expect.unreachable()
		} catch (error) {
			expect(
				(error as { fieldErrors: { field: string }[] }).fieldErrors.map(
					/** Field. */ (e) => e.field,
				),
			).toEqual(['visibility', 'selfEditMode', 'allowWorkerPreference', 'requiredness'])
		}
	})
})
