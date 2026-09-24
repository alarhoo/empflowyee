import type { HcmAccessContext } from './hcm-runtime-contract'
/** Evaluate explicit discovery capabilities without equating navigation with business API authority. */
export function hasHcmDiscoveryCapabilities(
	policy: {
		requiredPermissions?: readonly string[]
		requiredEntitlements?: readonly string[]
		requiredFeatureFlags?: readonly string[]
	},
	access: HcmAccessContext,
): boolean {
	return (
		(policy.requiredPermissions ?? []).every(
			/** Require each persisted capability. */ (permission) =>
				access.permissions.includes(permission),
		) &&
		(policy.requiredEntitlements ?? []).every(
			/** Require each enabled commercial projection. */ (entitlement) =>
				access.entitlements.includes(entitlement),
		) &&
		(policy.requiredFeatureFlags ?? []).every(
			/** Respect explicit rollout conditions when declared. */ (flag) =>
				access.featureFlags.includes(flag),
		)
	)
}
/** Placement roles determine visible Spaces only and do not grant permissions. */
export function hasHcmSpacePlacement(
	roleIds: readonly string[] | undefined,
	access: Pick<HcmAccessContext, 'roles'>,
): boolean {
	return (
		!roleIds ||
		roleIds.some(
			/** Match a canonical Space placement against persisted role identity. */ (role) =>
				access.roles.includes(role),
		)
	)
}
