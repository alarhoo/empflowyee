import { HCM_FEATURES, HCM_SPACES } from './hcm-catalog.fixture'
import type {
	HcmFeatureDefinition,
	HcmSpaceDefinition,
	VisibleHcmSpace,
} from './hcm-catalog.models'

/** Filter navigation with any-role/all-entitlement matching; this is never backend authorization. */
export function getVisibleHcmSpaces(
	roles: ReadonlySet<string>,
	entitlements: ReadonlySet<string>,
	spaces: readonly HcmSpaceDefinition[] = HCM_SPACES,
	features: readonly HcmFeatureDefinition[] = HCM_FEATURES,
): readonly VisibleHcmSpace[] {
	const featuresById = new Map(
		features.map(
			/** Index stable feature IDs reused across pages. */ (feature) => [feature.id, feature],
		),
	)
	const visible: VisibleHcmSpace[] = []
	for (const space of spaces) {
		if (!matchesAnyRole(space.requiredRoles, roles)) continue
		const pages: VisibleHcmSpace['pages'][number][] = []
		for (const page of space.pages) {
			const groups: VisibleHcmSpace['pages'][number]['groups'][number][] = []
			for (const group of page.groups) {
				const entries = group.featureIds
					.map(/** Resolve a placement to its canonical definition. */ (id) => featuresById.get(id))
					.filter(
						/** Omit unresolved IDs and entries outside the principal's visibility. */ (
							feature,
						): feature is HcmFeatureDefinition =>
							feature !== undefined && isFeatureVisible(feature, roles, entitlements),
					)
					.map(
						/** Mark entries as visible for consumers. */ (feature) => ({
							...feature,
							visible: true as const,
						}),
					)
				if (entries.length) groups.push({ id: group.id, title: group.title, features: entries })
			}
			if (groups.length) pages.push({ id: page.id, title: page.title, groups })
		}
		if (pages.length) visible.push({ ...space, pages })
	}
	return visible
}

/** Require every licensed capability even for a tenant super admin. */
function isFeatureVisible(
	feature: HcmFeatureDefinition,
	roles: ReadonlySet<string>,
	entitlements: ReadonlySet<string>,
): boolean {
	return (
		matchesAnyRole(feature.requiredRoles, roles) &&
		(feature.requiredEntitlements ?? []).every(
			/** Require this commercial capability. */ (entitlement) => entitlements.has(entitlement),
		)
	)
}

/** Accept unrestricted entries or at least one required presentation role. */
function matchesAnyRole(
	requiredRoles: readonly string[] | undefined,
	effectiveRoles: ReadonlySet<string>,
): boolean {
	return (
		!requiredRoles?.length ||
		requiredRoles.some(/** Match one permitted role. */ (role) => effectiveRoles.has(role))
	)
}
