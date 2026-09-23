import type { HcmAccessContext } from '@empflowyee/hcm-runtime-contract'
import { HCM_FEATURES, HCM_SPACES, HCM_FOUNDATION_FEATURES } from './hcm-catalog.fixture'
import type {
	HcmFeatureDefinition,
	HcmSpaceDefinition,
	VisibleHcmSpace,
} from './hcm-catalog.models'

/** Require every explicit capability and rollout flag; roles never grant access. */
export function canAccessHcmFeature(
	feature: HcmFeatureDefinition | undefined,
	access: HcmAccessContext,
): boolean {
	return !!feature?.available && !!feature.route && canDiscoverHcmFeature(feature, access)
}

/** Require explicit discovery capabilities independently from implementation availability. */
export function canDiscoverHcmFeature(
	feature: HcmFeatureDefinition | undefined,
	access: HcmAccessContext,
): boolean {
	return (
		!!feature &&
		(feature.requiredPermissions ?? []).every(
			/** Match each independently authorized capability. */ (permission) =>
				access.permissions.includes(permission),
		) &&
		(feature.requiredEntitlements ?? []).every(
			/** Require every licensed product capability. */ (entitlement) =>
				access.entitlements.includes(entitlement),
		) &&
		(feature.requiredFeatureFlags ?? []).every(
			/** Hide disabled product rollouts. */ (flag) => access.featureFlags.includes(flag),
		)
	)
}

/** Look up one canonical stable ID for route and navigation policy. */
export function findHcmFeature(id: unknown): HcmFeatureDefinition | undefined {
	return [...HCM_FEATURES, ...HCM_FOUNDATION_FEATURES].find(
		/** Match only the declared catalog identifier. */ (feature) => feature.id === id,
	)
}

/** Project discoverable placements independently of route availability; prune empty ancestors. */
export function getVisibleHcmSpaces(
	access: HcmAccessContext,
	spaces: readonly HcmSpaceDefinition[] = HCM_SPACES,
	features: readonly HcmFeatureDefinition[] = HCM_FEATURES,
	inspectAll = false,
): readonly VisibleHcmSpace[] {
	const featuresById = new Map(
		features.map(
			/** Index canonical definitions reused by multiple placements. */ (feature) => [
				feature.id,
				feature,
			],
		),
	)
	const visible: VisibleHcmSpace[] = []
	for (const space of spaces) {
		if (
			!inspectAll &&
			space.roleIds &&
			!space.roleIds.some(
				/** Check navigation placement independently of capability authorization. */ (role) =>
					access.roles.includes(role),
			)
		)
			continue
		const pages: VisibleHcmSpace['pages'][number][] = []
		for (const page of space.pages) {
			const groups: VisibleHcmSpace['pages'][number]['groups'][number][] = []
			for (const group of page.groups) {
				const entries = group.featureIds
					.map(/** Resolve a placement without importing a feature. */ (id) => featuresById.get(id))
					.filter(
						/** Keep permitted planned and implemented entries, or inspect all public metadata. */ (
							feature,
						): feature is HcmFeatureDefinition =>
							!!feature && (inspectAll || canDiscoverHcmFeature(feature, access)),
					)
					.sort(
						/** Preserve deterministic product ordering. */ (a, b) =>
							(a.order ?? 0) - (b.order ?? 0),
					)
					.map(
						/** Mark the public projection for navigation consumers. */ (feature) => ({
							...feature,
							visible: true as const,
						}),
					)
				if (entries.length) groups.push({ id: group.id, title: group.title, features: entries })
			}
			if (groups.length)
				pages.push({ id: page.id, title: page.title, description: page.description, groups })
		}
		if (pages.length) visible.push({ ...space, pages })
	}
	return visible
}
