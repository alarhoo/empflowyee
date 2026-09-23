import {
	HcmRuntimeError,
	HcmSessionReader,
	TenantDirectory,
	type TenantRecord,
} from '@empflowyee/hcm-api-runtime-domain'
import { HcmRuntimeStore } from './hcm-runtime-store'

export class UnconfiguredSessionReader extends HcmSessionReader {
	/** Deny every session when production authentication or local activation is absent. */
	async read(): Promise<null> {
		return null
	}
}
export class UnconfiguredTenantDirectory extends TenantDirectory {
	/** Fail closed rather than deriving tenant authority from an arbitrary hostname. */
	async findByHost(): Promise<null> {
		throw new HcmRuntimeError('runtime-unavailable')
	}
}

/** Require the established local opt-in and reject production/cloud execution. */
export function assertLocalRuntime(env: Readonly<Record<string, string | undefined>>): void {
	if (
		env['APP_ENVIRONMENT'] !== 'local' ||
		!['development', 'test'].includes(env['NODE_ENV'] ?? '') ||
		['K_SERVICE', 'K_REVISION', 'K_JOB', 'CLOUD_RUN_JOB', 'KUBERNETES_SERVICE_HOST'].some(
			/** Cloud markers cannot be overridden by local flags. */ (key) => Boolean(env[key]),
		)
	)
		throw new Error('Local database runtime is forbidden in this environment')
}

/** Allow only loopback callers through the existing development trust boundary. */
export function isLocalPeer(peer?: string): boolean {
	return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer ?? '')
}

export class LocalTenantDirectory extends TenantDirectory {
	/** Bind the persisted routing/presentation adapter without in-memory fallback records. */
	constructor(private readonly store: HcmRuntimeStore) {
		super()
	}
	/** Resolve exact Host authority only for loopback development callers. */
	async findByHost(host: string, peerAddress?: string): Promise<TenantRecord | null> {
		return isLocalPeer(peerAddress) ? this.store.tenant(host) : null
	}
}

/** Compose one lazy database store only when local tenant discovery is explicitly enabled. */
export function createRuntimeStore(
	env: Readonly<Record<string, string | undefined>>,
): HcmRuntimeStore | null {
	if (env['HCM_LOCAL_TENANTS'] !== 'true') return null
	assertLocalRuntime(env)
	if (!env['HCM_DATABASE_URL'])
		throw new Error('Persistent local HCM_DATABASE_URL is required; run pnpm hcm:db:up first')
	return new HcmRuntimeStore(env['HCM_DATABASE_URL'])
}

/** Select the persisted local directory or the ordinary fail-closed unconfigured port. */
export function createTenantDirectory(
	env: Readonly<Record<string, string | undefined>>,
	store?: HcmRuntimeStore | null,
): TenantDirectory {
	if (env['HCM_LOCAL_TENANTS'] !== 'true') return new UnconfiguredTenantDirectory()
	assertLocalRuntime(env)
	if (!store) throw new Error('Local tenant discovery requires the persistent database store')
	return new LocalTenantDirectory(store)
}
