import {
	HcmSessionReader,
	type HcmSessionRequest,
	type VerifiedHcmSession,
} from '@empflowyee/hcm-api-runtime-domain'
import {
	assertLocalRuntime,
	isLocalPeer,
	UnconfiguredSessionReader,
} from './hcm-api-runtime-infrastructure'
import { HcmRuntimeStore } from './hcm-runtime-store'

export class LocalDevelopmentSessionReader extends HcmSessionReader {
	/** Bind SQL-backed development identity and grants while preserving the normal session port. */
	constructor(private readonly store: HcmRuntimeStore) {
		super()
	}
	/** Reject nonlocal or unresolved requests before selecting a persisted account in the resolved tenant. */
	async read(
		_cookie: string | undefined,
		request?: HcmSessionRequest,
	): Promise<VerifiedHcmSession | null> {
		if (!isLocalPeer(request?.peerAddress) || !request?.tenantId) return null
		return this.store.session(request.tenantId, request.developmentPersona)
	}
}

/** Activate persisted development personas only under the accepted local-session configuration. */
export function createSessionReader(
	env: Readonly<Record<string, string | undefined>>,
	store?: HcmRuntimeStore | null,
): HcmSessionReader {
	if (env['HCM_LOCAL_SESSION'] !== 'true') return new UnconfiguredSessionReader()
	assertLocalRuntime(env)
	if (env['HCM_LOCAL_TENANTS'] !== 'true' || !store)
		throw new Error('Local sessions require the persistent tenant database store')
	return new LocalDevelopmentSessionReader(store)
}
