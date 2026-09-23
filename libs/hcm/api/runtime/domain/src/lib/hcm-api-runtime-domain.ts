import type {
	HcmAccessContext,
	HcmPreferences,
	HcmRuntimeContext,
	RuntimeFailureCode,
	TenantDiscoveryResponse,
} from '@empflowyee/hcm-runtime-contract'

export interface TenantRecord {
	/** Internal authority; never part of the public discovery response. */
	id: string
	discovery: TenantDiscoveryResponse
}

export interface VerifiedHcmSession {
	tenantId: string
	user: HcmRuntimeContext['user']
	access: HcmAccessContext
	preferences: HcmPreferences
	version: string
	expiresAt: string
	development?: HcmRuntimeContext['development']
}

export abstract class TenantDirectory {
	abstract findByHost(host: string, peerAddress?: string): Promise<TenantRecord | null>
}

export abstract class HcmSessionReader {
	/** Adapters must verify session integrity, revocation and membership; raw cookies are never identity. */
	abstract read(
		cookie: string | undefined,
		request?: HcmSessionRequest,
	): Promise<VerifiedHcmSession | null>
}

export interface HcmSessionRequest {
	peerAddress?: string
	developmentPersona?: string
}

export class HcmRuntimeError extends Error {
	/** Carry a safe classification without retaining request payloads or provider errors. */
	constructor(readonly code: RuntimeFailureCode) {
		super(code)
	}
}

/** Normalize a single Host authority; forwarded headers, credentials, paths and host lists are rejected. */
export function normalizeTenantHost(authority: string | undefined): string {
	if (!authority || !/^[a-zA-Z0-9.-]+(?::[0-9]{1,5})?$/.test(authority))
		throw new HcmRuntimeError('tenant-not-found')
	let url: URL
	try {
		url = new URL(`http://${authority}`)
	} catch {
		throw new HcmRuntimeError('tenant-not-found')
	}
	const host = url.hostname.toLowerCase()
	if (host.endsWith('.') || host.includes('..')) throw new HcmRuntimeError('tenant-not-found')
	return host
}
