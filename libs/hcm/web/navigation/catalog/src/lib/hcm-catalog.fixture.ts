import { HCM_CATALOGUE } from '@empflowyee/hcm-runtime-contract/catalogue'
import type { HcmFeatureDefinition, HcmSpaceDefinition } from './hcm-catalog.models'

export const HCM_FEATURES: readonly HcmFeatureDefinition[] = HCM_CATALOGUE.apps.map(
	/** Project one canonical business app without importing its implementation. */ (app) => ({
		id: app.appCode,
		title: app.title,
		description:
			app.domain
				.replaceAll('-', ' ')
				.replace(
					/\b\w/g,
					/** Capitalize the domain label without inventing application behavior. */ (letter) =>
						letter.toUpperCase(),
				) + ' workspace',
		domain: app.domain,
		route: app.route ?? '',
		available:
			app.implementationStatus === 'complete' &&
			app.fddStatus === 'approved' &&
			app.tddStatus === 'approved' &&
			!!app.route,
		requiredPermissions: [app.discoveryPolicy.permission],
		requiredEntitlements: [app.discoveryPolicy.entitlement],
	}),
)

// Foundation routing proof is deliberately outside the canonical business inventory.
export const HCM_FOUNDATION_FEATURES: readonly HcmFeatureDefinition[] = [
	{
		id: 'runtime-workspace',
		title: 'Workspace preview',
		description: 'Foundation routing proof',
		route: '/workspace',
		domain: 'runtime',
		available: true,
		requiredPermissions: ['employee.directory.read'],
		requiredEntitlements: ['employee-core'],
		requiredFeatureFlags: ['shell-preview'],
	},
]

export const HCM_SPACES: readonly HcmSpaceDefinition[] = HCM_CATALOGUE.spaces.map(
	/** Preserve canonical Space, Page and Group order independently of source ownership. */ (
		space,
	) => ({
		id: space.spaceId,
		title: space.title,
		description: space.description,
		roleIds: HCM_CATALOGUE.businessRoles
			.filter(
				/** Resolve roles that place this Space in normal navigation. */ (role) =>
					role.spaceIds.includes(space.spaceId),
			)
			.map(/** Retain stable role identity for placement only. */ (role) => role.roleId),
		pages: space.pageIds.map(
			/** Resolve a canonical Page and its group placements. */ (id) => {
				const page = HCM_CATALOGUE.pages.find(
					/** Locate the referenced Page metadata. */ (entry) => entry.pageId === id,
				)
				if (!page) throw new Error(`Unknown canonical page ${id}`)
				return {
					id,
					title: page.title,
					description: page.description,
					groups: page.sections.map(
						/** Translate canonical sections into existing group models. */ (section) => ({
							id: section.sectionId,
							title: section.title,
							featureIds: section.appCodes,
						}),
					),
				}
			},
		),
	}),
)
