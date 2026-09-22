import { describe, expect, it } from 'vitest'
import { getVisibleHcmSpaces } from './hcm-catalog.filter'
import { HCM_FEATURES, HCM_SPACES } from './hcm-catalog.fixture'
import type { VisibleHcmSpace } from './hcm-catalog.models'

/** Flatten visible feature IDs to verify pruning without coupling tests to display labels. */
function featureIds(spaces: readonly VisibleHcmSpace[]): string[] {
	const ids: string[] = []
	for (const space of spaces)
		for (const page of space.pages)
			for (const group of page.groups) {
				for (const feature of group.features) ids.push(feature.id)
			}
	return ids
}

describe('HCM catalog visibility', /** Verify role matching, commercial gates and empty hierarchy pruning. */ () => {
	it('shows licensed features while retaining domain ownership', /** Match either allowed administration role and the required entitlement. */ () => {
		const spaces = getVisibleHcmSpaces(new Set(['tenant-admin']), new Set(['administration']))
		expect(featureIds(spaces)).toEqual(['tenant-settings'])
		expect(spaces[0].id).toBe('administration')
		expect(spaces[0].pages[0].groups[0].features[0].domain).toBe('administration')
	})
	it('does not let a super admin bypass entitlements', /** Keep only the explicitly unlicensed lab entry. */ () => {
		const spaces = getVisibleHcmSpaces(new Set(['tenant-super-admin']), new Set())
		expect(featureIds(spaces)).toEqual(['theme-lab'])
		expect(spaces).toHaveLength(1)
	})
	it('prunes empty Spaces, Pages and groups', /** Return no navigation when the principal has no matching role. */ () => {
		expect(getVisibleHcmSpaces(new Set(), new Set(['administration']))).toEqual([])
	})
	it('requires every entitlement and ignores unresolved placements', /** Exercise all-match behavior and unknown feature IDs using a small independent catalog. */ () => {
		const spaces = [
			{
				id: 's',
				title: 'S',
				description: '',
				pages: [
					{ id: 'p', title: 'P', groups: [{ id: 'g', title: 'G', featureIds: ['f', 'missing'] }] },
				],
			},
		]
		const features = [
			{
				id: 'f',
				title: 'F',
				description: '',
				route: '/f',
				domain: 'test',
				requiredRoles: ['one', 'two'],
				requiredEntitlements: ['a', 'b'],
			},
		]
		expect(getVisibleHcmSpaces(new Set(['two']), new Set(['a']), spaces, features)).toEqual([])
		expect(
			featureIds(getVisibleHcmSpaces(new Set(['two']), new Set(['a', 'b']), spaces, features)),
		).toEqual(['f'])
	})
	it('keeps fixture identifiers unique and all placements resolvable', /** Reject catalog drift before it silently removes navigation. */ () => {
		const ids = new Set(
			HCM_FEATURES.map(/** Collect canonical feature identifiers. */ (feature) => feature.id),
		)
		expect(ids.size).toBe(HCM_FEATURES.length)
		const hierarchyIds: string[] = []
		for (const space of HCM_SPACES) {
			hierarchyIds.push(space.id)
			for (const page of space.pages) {
				hierarchyIds.push(page.id)
				for (const group of page.groups) {
					hierarchyIds.push(group.id)
					for (const id of group.featureIds) expect(ids.has(id)).toBe(true)
				}
			}
		}
		expect(new Set(hierarchyIds).size).toBe(hierarchyIds.length)
	})
})
