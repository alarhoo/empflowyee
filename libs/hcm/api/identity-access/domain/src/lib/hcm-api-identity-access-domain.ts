import { IdentityError } from '@empflowyee/hcm-identity-access-contract'
/** Account identity remains immutable; enablement shares the revision used by role assignments. */
export function requireAccountRevision(current: number, expected: number): void {
	if (current !== expected) throw new IdentityError('revision-conflict')
}
