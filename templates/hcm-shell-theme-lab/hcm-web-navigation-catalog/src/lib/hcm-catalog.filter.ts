import { HCM_FEATURES, HCM_SPACES } from './hcm-catalog.fixture'
import type {
	HcmFeatureDefinition,
	VisibleHcmGroup,
	VisibleHcmPage,
	VisibleHcmSpace,
} from './hcm-catalog.models'

/** Pure catalog filtering. UI visibility is not backend authorization. */
export function getVisibleHcmSpaces(
	roles: ReadonlySet<string>,
	entitlements: ReadonlySet<string>,
): readonly VisibleHcmSpace[] {
	const featuresById = new Map(
		HCM_FEATURES.map(
			/** Index reusable feature definitions by stable ID. */ (feature) => [feature.id, feature],
		),
	)

	return HCM_SPACES.filter(
		/** Keep Spaces matching the principal's presentation roles. */ (space) =>
			matchesAnyRole(space.requiredRoles, roles),
	)
		.map(
			/** Resolve visible Pages for this Space. */ (space) => {
				const pages: VisibleHcmPage[] = space.pages
					.map(
						/** Resolve and prune the Page's feature groups. */ (page) => {
							const groups: VisibleHcmGroup[] = page.groups
								.map(
									/** Resolve this group's feature placements. */ (group) => ({
										id: group.id,
										title: group.title,
										features: group.featureIds
											.map(
												/** Look up the canonical feature for a placement. */ (id) =>
													featuresById.get(id),
											)
											.filter(
												/** Discard unknown feature identifiers. */ (
													feature,
												): feature is HcmFeatureDefinition => Boolean(feature),
											)
											.filter(
												/** Apply role and commercial-entitlement visibility checks. */ (feature) =>
													isFeatureVisible(feature, roles, entitlements),
											)
											.map(
												/** Mark the resolved feature as visible. */ (feature) => ({
													...feature,
													visible: true as const,
												}),
											),
									}),
								)
								.filter(
									/** Omit groups without visible features. */ (group) => group.features.length > 0,
								)

							return { id: page.id, title: page.title, groups }
						},
					)
					.filter(/** Omit Pages without visible groups. */ (page) => page.groups.length > 0)

				return { ...space, pages }
			},
		)
		.filter(/** Omit Spaces without visible Pages. */ (space) => space.pages.length > 0)
}

/** Require any permitted role and every required entitlement. */ function isFeatureVisible(
	feature: HcmFeatureDefinition,
	roles: ReadonlySet<string>,
	entitlements: ReadonlySet<string>,
): boolean {
	return (
		matchesAnyRole(feature.requiredRoles, roles) &&
		(feature.requiredEntitlements ?? []).every(
			/** Check whether the tenant has this licensed capability. */ (entitlement) =>
				entitlements.has(entitlement),
		)
	)
}

/** Match any required role or allow entries without a role restriction. */ function matchesAnyRole(
	requiredRoles: readonly string[] | undefined,
	effectiveRoles: ReadonlySet<string>,
): boolean {
	return (
		!requiredRoles?.length ||
		requiredRoles.some(
			/** Check one role against the principal's effective set. */ (role) =>
				effectiveRoles.has(role),
		)
	)
}
