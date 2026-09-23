import type { HcmAccessContext } from '@empflowyee/hcm-runtime-contract'
import { canAccessHcmFeature, findHcmFeature, getVisibleHcmSpaces } from './hcm-catalog.filter'
import { HCM_FEATURES, HCM_FOUNDATION_FEATURES } from './hcm-catalog.fixture'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const access: HcmAccessContext = {
	roles: [],
	permissions: ['employee.directory.read'],
	entitlements: ['employee-core'],
	featureFlags: ['shell-preview'],
}

it('requires permissions, entitlements and flags independently of role names', /** Exercise each policy dimension against the canonical runnable placeholder. */ () => {
	const feature = findHcmFeature('runtime-workspace')
	expect(canAccessHcmFeature(feature, access)).toBe(true)
	for (const dimension of ['permissions', 'entitlements', 'featureFlags'] as const) {
		expect(
			canAccessHcmFeature(feature, { ...access, roles: ['tenant-super-admin'], [dimension]: [] }),
		).toBe(false)
		expect(getVisibleHcmSpaces({ ...access, [dimension]: [] })).toEqual([])
	}
	expect(canAccessHcmFeature(undefined, access)).toBe(false)
	expect(canAccessHcmFeature(findHcmFeature('profile'), access)).toBe(false)
})

it('keeps the pure catalog independent of feature implementations', /** Guard both static and dynamic implementation imports in the canonical metadata and policy source. */ () => {
	const directory = resolve('libs/hcm/web/navigation/catalog/src/lib')
	for (const file of readdirSync(directory).filter(
		/** Restrict the import audit to maintained production catalog source. */ (name) =>
			name.endsWith('.ts') && !name.endsWith('.spec.ts'),
	)) {
		const source = readFileSync(resolve(directory, file), 'utf8')
		expect(source).not.toMatch(/\bimport\s*\(/)
		for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
			expect(
				match[1] === '@empflowyee/hcm-runtime-contract' ||
					match[1] === '@empflowyee/hcm-runtime-contract/catalogue' ||
					/^\.\/hcm-catalog\.(models|fixture)$/.test(match[1]),
			).toBe(true)
		}
	}
})

it('reuses one feature in multiple placements and retains deterministic ordering', /** Verify metadata reuse without implementation imports or duplicate definitions. */ () => {
	const spaces = [
		{
			id: 'test',
			title: 'Test',
			description: '',
			pages: [
				{
					id: 'one',
					title: 'One',
					groups: [
						{ id: 'g1', title: 'First', featureIds: ['runtime-workspace', 'missing'] },
						{ id: 'g2', title: 'Second', featureIds: ['runtime-workspace'] },
					],
				},
			],
		},
	]
	const visible = getVisibleHcmSpaces(access, spaces, HCM_FOUNDATION_FEATURES)
	expect(
		visible[0].pages[0].groups.map(
			/** Inspect canonical IDs in each projected placement. */ (group) => group.features[0].id,
		),
	).toEqual(['runtime-workspace', 'runtime-workspace'])
	expect(
		new Set(
			HCM_FEATURES.map(
				/** Collect IDs to reject duplicate catalog definitions. */ (feature) => feature.id,
			),
		).size,
	).toBe(HCM_FEATURES.length)
})
