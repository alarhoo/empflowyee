/** Workforce facts resolved by the owning domain, never copied directly from a browser command. */
export interface HcmScopeSubject {
	legalEntityId?: string
	orgUnitId?: string
	departmentId?: string
	locationId?: string
	assignmentId?: string
	employmentId?: string
}

export type HcmScopeDimension = keyof HcmScopeSubject | 'tenant'

export interface HcmGrantScope {
	dimension: HcmScopeDimension
	targetId: string
}

/** Match one complete grant: alternatives within a dimension, intersection across dimensions.
 * Empty scopes preserve existing tenant-wide grants. A restricted grant never authorizes an
 * unscoped query, and facts from different grants cannot be combined to satisfy one operation.
 */
export function grantCoversSubject(
	scopes: readonly HcmGrantScope[],
	tenantId: string,
	subject?: Readonly<HcmScopeSubject>,
): boolean {
	const dimensions = new Map<HcmScopeDimension, Set<string>>()
	for (const scope of scopes) {
		const targets = dimensions.get(scope.dimension) ?? new Set<string>()
		targets.add(scope.targetId)
		dimensions.set(scope.dimension, targets)
	}
	for (const [dimension, targets] of dimensions) {
		const actual = dimension === 'tenant' ? tenantId : subject?.[dimension]
		if (!actual || !targets.has(actual)) return false
	}
	return true
}
