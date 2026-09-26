import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'
import {
	PROFILE_VISIBILITIES,
	SELF_EDIT_MODES,
	type ProfileFieldPolicyDto,
	type ProfileSensitivity,
	type ProfileVisibility,
	type SelfEditMode,
	type ViewerRelation,
} from '@empflowyee/hcm-employee-contract'

/** Position of a visibility audience, narrowest first (Self = 0). */
export function visibilityRank(visibility: ProfileVisibility): number {
	return PROFILE_VISIBILITIES.indexOf(visibility)
}

/** Position of an edit mode, narrowest first (NotEditable = 0). */
export function editModeRank(mode: SelfEditMode): number {
	return SELF_EDIT_MODES.indexOf(mode)
}

/** The narrowest of the given audiences; absent values do not widen anything. */
export function narrowestVisibility(
	...values: (ProfileVisibility | null | undefined)[]
): ProfileVisibility {
	return values.reduce<ProfileVisibility>(
		/** Keep the narrower audience. */ (narrowest, value) =>
			value && visibilityRank(value) < visibilityRank(narrowest) ? value : narrowest,
		'Organization',
	)
}

/** A custom field's ceiling derives from its sensitivity, mirroring migration 000022. */
export function sensitivityCeiling(sensitivity: ProfileSensitivity): ProfileVisibility {
	if (sensitivity === 'DirectorySafe') return 'Organization'
	if (sensitivity === 'Personal') return 'Manager'
	return 'Hr'
}

/** Whether a viewer with this relation belongs to the audience of a visibility. */
export function relationSees(relation: ViewerRelation, visibility: ProfileVisibility): boolean {
	return visibilityRank(relation) <= visibilityRank(visibility)
}

export interface FieldPolicyInputs {
	ceiling: ProfileVisibility
	productDefault: ProfileFieldPolicyDto | null
	tenantPolicy: ProfileFieldPolicyDto | null
	/** The worker's preference, honoured only where the effective policy allows one. */
	preference: ProfileVisibility | null
}

/**
 * Effective visibility of one field for one worker: the most restrictive of the product ceiling,
 * the product default, the tenant policy and an allowed worker preference. A Hidden field is not
 * collected for the tenant and is visible to nobody (null).
 */
export function effectiveVisibility(input: FieldPolicyInputs): ProfileVisibility | null {
	const policy = input.tenantPolicy ?? input.productDefault
	if (policy?.requiredness === 'Hidden') return null
	const preference = policy?.allowWorkerPreference ? input.preference : null
	return narrowestVisibility(
		input.ceiling,
		input.productDefault?.visibility,
		input.tenantPolicy?.visibility,
		preference,
	)
}

/**
 * Reject a tenant policy that widens the product baseline: visibility above the ceiling, an edit
 * mode above the product default, a preference the product does not allow, or a product-required
 * field made optional. Mirrors the trigger in migration 000022 so callers get a field error.
 */
export function requireTenantNarrowing(
	ceiling: ProfileVisibility,
	productDefault: ProfileFieldPolicyDto | null,
	policy: ProfileFieldPolicyDto,
): void {
	const errors: { field: string; code: string }[] = []
	if (visibilityRank(policy.visibility) > visibilityRank(ceiling))
		errors.push({ field: 'visibility', code: 'visibility-ceiling-exceeded' })
	if (productDefault) {
		if (editModeRank(policy.selfEditMode) > editModeRank(productDefault.selfEditMode))
			errors.push({ field: 'selfEditMode', code: 'visibility-ceiling-exceeded' })
		if (policy.allowWorkerPreference && !productDefault.allowWorkerPreference)
			errors.push({ field: 'allowWorkerPreference', code: 'visibility-ceiling-exceeded' })
		if (productDefault.requiredness === 'Required' && policy.requiredness !== 'Required')
			errors.push({ field: 'requiredness', code: 'visibility-ceiling-exceeded' })
	}
	if (errors.length) throw new HcmDomainError('visibility-ceiling-exceeded', errors)
}
