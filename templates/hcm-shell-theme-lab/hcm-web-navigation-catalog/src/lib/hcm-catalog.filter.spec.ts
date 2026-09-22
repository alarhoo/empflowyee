import { describe, expect, it } from 'vitest'
import { getVisibleHcmSpaces } from './hcm-catalog.filter'

describe('HCM catalog filtering', /** Group catalog visibility examples from the supplied milestone template. */ () => {
	it('shows Administration to a licensed tenant super admin', /** Verify licensed administration is visible to a super admin. */ () => {
		const spaces = getVisibleHcmSpaces(
			new Set(['employee', 'tenant-super-admin']),
			new Set(['employee-core', 'organisation', 'administration']),
		)
		expect(
			spaces.some(
				/** Find the administration Space in the filtered result. */ (space) =>
					space.id === 'administration',
			),
		).toBe(true)
	})

	it('does not bypass missing commercial entitlements', /** Verify super admin status does not bypass a missing entitlement. */ () => {
		const spaces = getVisibleHcmSpaces(new Set(['tenant-super-admin']), new Set())
		const administration = spaces.find(
			/** Locate the remaining administration entries. */ (space) => space.id === 'administration',
		)
		const featureIds =
			administration?.pages.flatMap(
				/** Flatten the pages into their feature identifiers. */ (page) =>
					page.groups.flatMap(
						/** Flatten groups into their feature identifiers. */ (group) =>
							group.features.map(/** Project the stable feature identifier. */ (f) => f.id),
					),
			) ?? []
		expect(featureIds).toContain('theme-lab')
		expect(featureIds).not.toContain('tenant-settings')
	})
})
