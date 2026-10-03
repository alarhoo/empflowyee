import { HcmRuntimeError } from '@empflowyee/hcm-api-runtime-domain'
import type { AuthenticatedHcmContext } from './hcm-api-runtime-application'
import { requireWorkloadScope, type HcmWorkloadContext } from './workload-context'

export interface HcmActionBinding {
	permission: string
	scopeReference: string
	intentDigest: string
}
export interface HcmActionAuthority {
	readonly referenceId: string
}
export interface HcmActionAuthorityRecord extends HcmActionBinding {
	referenceId: string
	tenantId: string
	accountId: string
	expiresAt: number
}
export interface HcmActionAuthorizationStore {
	/** Persist an immutable reference using the private verified context in the accepting transaction. */
	issue(context: AuthenticatedHcmContext, binding: HcmActionBinding): Promise<string>
	/** Read only this tenant's immutable authority record; a missing reference never becomes authority. */
	read(referenceId: string): Promise<HcmActionAuthorityRecord | null>
}
export abstract class HcmActionAuthorizationBinder {
	/** Bind Runtime-owned authority persistence to the caller's existing tenant transaction. */
	abstract bind(transaction: unknown, tenantId: string): HcmActionAuthorizationStore
}

const authorities = new WeakMap<
	HcmActionAuthority,
	{ record: Readonly<HcmActionAuthorityRecord>; workload: HcmWorkloadContext }
>()

/** Reject incomplete or malformed immutable bindings before they can enter the authority store. */
export function validateHcmActionBinding(binding: HcmActionBinding): void {
	if (
		!binding ||
		!/^[a-z][a-z0-9.-]{0,199}$/.test(binding.permission) ||
		!/^[a-f0-9]{64}$/.test(binding.scopeReference) ||
		!/^[a-f0-9]{64}$/.test(binding.intentDigest)
	)
		throw new HcmRuntimeError('forbidden')
}

/** Restore only stored human authority for a verified dispatch; workload authority cannot extend human expiry. */
export class HcmActionAuthorityResolver {
	/** Use the Runtime owner store already bound to the dispatch transaction. */
	constructor(private readonly store: HcmActionAuthorizationStore) {}
	/** Check tenant, exact intent/operation/scope and original expiry before issuing a non-serializable capability. */
	async resolve(
		workload: HcmWorkloadContext,
		referenceId: string,
		binding: HcmActionBinding,
	): Promise<HcmActionAuthority> {
		validateHcmActionBinding(binding)
		const scope = requireWorkloadScope(workload, 'WorkflowDispatch')
		const record = await this.store.read(referenceId)
		requireWorkloadScope(workload, 'WorkflowDispatch')
		if (
			!record ||
			record.tenantId !== scope.tenantId ||
			record.referenceId !== referenceId ||
			record.permission !== binding.permission ||
			record.scopeReference !== binding.scopeReference ||
			record.intentDigest !== binding.intentDigest
		)
			throw new HcmRuntimeError('forbidden')
		if (!Number.isFinite(record.expiresAt) || record.expiresAt <= Date.now())
			throw new HcmRuntimeError('unauthenticated')
		const authority = Object.freeze({ referenceId })
		authorities.set(authority, { record: Object.freeze({ ...record }), workload })
		return authority
	}
}

/** Recheck both capabilities at each source authorization/commit boundary; copies and expired contexts are denied. */
export function requireHcmActionAuthority(
	authority: HcmActionAuthority,
): Readonly<HcmActionAuthorityRecord> {
	const registered = authorities.get(authority)
	if (!registered || registered.record.expiresAt <= Date.now())
		throw new HcmRuntimeError('unauthenticated')
	const workload = requireWorkloadScope(registered.workload, 'WorkflowDispatch')
	if (workload.tenantId !== registered.record.tenantId) throw new HcmRuntimeError('forbidden')
	return registered.record
}
