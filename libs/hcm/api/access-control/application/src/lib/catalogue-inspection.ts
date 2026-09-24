import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	hasHcmDiscoveryCapabilities,
	hasHcmSpacePlacement,
	type HcmCatalogue,
	type HcmAccessContext,
} from '@empflowyee/hcm-runtime-contract'
import {
	assignmentAccountId,
	type AssignmentQuery,
	type Page,
	type CatalogueAccount,
	type CatalogueEntry,
	type CatalogueDiscovery,
	type DiscoveryReason,
} from '@empflowyee/hcm-access-control-contract'
export interface CatalogueInspectionWork {
	/** Query enabled tenant entitlements without exposing commercial editing. */
	entitlements(): Promise<string[]>
	/** Read bounded account choices as projections, never impersonation. */
	accounts(query: AssignmentQuery): Promise<Page<CatalogueAccount>>
	/** Resolve actual enabled state and grants for the selected tenant subject. */
	subject(id: string): Promise<{ enabled: boolean; access: HcmAccessContext }>
}
export abstract class CatalogueInspectionUnit {
	/** Require catalogue business-read authority before any subject projection. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		work: (scope: CatalogueInspectionWork) => Promise<T>,
	): Promise<T>
}
export class CatalogueInspection {
	/** Inject the immutable canonical metadata separately from tenant-owned SQL projections. */
	constructor(
		private readonly unit: CatalogueInspectionUnit,
		private readonly catalogue: HcmCatalogue,
	) {}
	/** Combine the canonical inventory with this tenant's enabled entitlement projection. */
	list(context: AuthenticatedHcmContext): Promise<{ items: CatalogueEntry[] }> {
		return this.unit.execute(
			context,
			/** Project only safe catalogue and commercial availability fields. */ async (scope) => {
				const entitlements = await scope.entitlements()
				return {
					items: this.catalogue.apps.map(
						/** Preserve one entry per canonical app and all its visual placements. */ (app) => {
							const placements: CatalogueEntry['placements'] = []
							for (const space of this.catalogue.spaces)
								for (const pageId of space.pageIds) {
									const page = this.catalogue.pages.find(
										/** Resolve canonical Page identity, not filesystem ownership. */ (item) =>
											item.pageId === pageId,
									)
									for (const section of page?.sections ?? [])
										if (section.appCodes.includes(app.appCode))
											placements.push({
												spaceId: space.spaceId,
												spaceTitle: space.title,
												pageId,
												pageTitle: page?.title ?? pageId,
												sectionId: section.sectionId,
												sectionTitle: section.title,
												display: section.display,
											})
								}
							return {
								appCode: app.appCode,
								title: app.title,
								domain: app.domain,
								status: app.implementationStatus,
								route: app.route,
								discoveryPermission: app.discoveryPolicy.permission,
								entitlement: app.discoveryPolicy.entitlement,
								entitled: entitlements.includes(app.discoveryPolicy.entitlement),
								placements,
							}
						},
					),
				}
			},
		)
	}
	/** List subjects under catalogue-read authority without broadening to account management. */
	accounts(
		context: AuthenticatedHcmContext,
		query: AssignmentQuery,
	): Promise<Page<CatalogueAccount>> {
		return this.unit.execute(
			context,
			/** Use only the bounded identity projection. */ (scope) => scope.accounts(query),
		)
	}
	/** Explain the exact discovery predicate independently from implementation status and business authorization. */
	discovery(context: AuthenticatedHcmContext, id: string): Promise<CatalogueDiscovery> {
		assignmentAccountId(id)
		return this.unit.execute(
			context,
			/** Read real grants for the chosen subject while retaining the verified actor. */ async (
				scope,
			) => {
				const subject = await scope.subject(id),
					access = subject.access
				return {
					accountId: id,
					items: this.catalogue.apps.map(
						/** Return all blocking discovery reasons without pretending a planned app is implemented. */ (
							app,
						) => {
							const reasons: DiscoveryReason[] = []
							if (!subject.enabled) reasons.push('account-disabled')
							if (
								!hasHcmDiscoveryCapabilities(
									{ requiredPermissions: [app.discoveryPolicy.permission] },
									access,
								)
							)
								reasons.push('missing-discovery-permission')
							if (
								!hasHcmDiscoveryCapabilities(
									{ requiredEntitlements: [app.discoveryPolicy.entitlement] },
									access,
								)
							)
								reasons.push('missing-entitlement')
							const placed = this.hasPlacement(app.appCode, access)
							if (!placed) reasons.push('no-role-placement')
							return { appCode: app.appCode, discoverable: reasons.length === 0, reasons }
						},
					),
				}
			},
		)
	}

	/** Match app membership against the same role-to-Space placement predicate as the launchpad. */
	private hasPlacement(appCode: string, access: HcmAccessContext): boolean {
		for (const space of this.catalogue.spaces) {
			const roleIds = this.catalogue.businessRoles
				.filter(
					/** Resolve canonical placement roles. */ (role) => role.spaceIds.includes(space.spaceId),
				)
				.map(/** Return stable role identities. */ (role) => role.roleId)
			if (!hasHcmSpacePlacement(roleIds, access)) continue
			for (const pageId of space.pageIds) {
				const page = this.catalogue.pages.find(
					/** Resolve this canonical Page. */ (item) => item.pageId === pageId,
				)
				if (
					page?.sections.some(
						/** Look for the selected app in any section. */ (section) =>
							section.appCodes.includes(appCode),
					)
				)
					return true
			}
		}
		return false
	}
}
