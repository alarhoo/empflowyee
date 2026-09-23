import {
	HcmRuntimeError,
	HcmSessionReader,
	TenantDirectory,
	type TenantRecord,
} from '@empflowyee/hcm-api-runtime-domain'

export class UnconfiguredSessionReader extends HcmSessionReader {
	/** Deny every unverified session until a reviewed real authentication adapter is installed. */
	async read(): Promise<null> {
		return null
	}
}

export class UnconfiguredTenantDirectory extends TenantDirectory {
	/** Fail closed rather than deriving a tenant from an arbitrary hostname. */
	async findByHost(): Promise<null> {
		throw new HcmRuntimeError('runtime-unavailable')
	}
}

export class LocalTenantDirectory extends TenantDirectory {
	/** Resolve deterministic local-only discovery fixtures; this adapter never creates authenticated sessions. */
	async findByHost(host: string, peerAddress?: string): Promise<TenantRecord | null> {
		if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peerAddress ?? '')) return null
		const states = {
			'acme.localhost': 'active',
			'suspended.localhost': 'suspended',
			'grace.localhost': 'grace',
			'deactivated.localhost': 'deactivated',
			'trial.localhost': 'trial',
		} as const
		const status = states[host as keyof typeof states]
		if (!status) return null
		const slug = host.split('.')[0]
		return {
			id: slug === 'acme' ? 'local-dunder-mifflin' : `local-${slug}`,
			discovery: {
				tenant: {
					slug,
					displayName: slug === 'acme' ? 'Dunder Mifflin' : 'Fictional HCM tenant',
					status,
					allowUserTheme: true,
					defaults: {
						theme: 'horizon-light',
						language: 'en',
						locale: 'en-IN',
						timezone: 'Asia/Kolkata',
					},
				},
				authentication: { strategies: [] },
			},
		}
	}
}

/** Require explicit local environment, opt-in and a non-cloud development process before enabling fixtures. */
export function createTenantDirectory(
	env: Readonly<Record<string, string | undefined>>,
): TenantDirectory {
	if (env['HCM_LOCAL_TENANTS'] !== 'true') return new UnconfiguredTenantDirectory()
	if (env['APP_ENVIRONMENT'] !== 'local' || env['NODE_ENV'] === 'production' || env['K_SERVICE'])
		throw new Error('Local tenant fixtures are forbidden in this environment')
	return new LocalTenantDirectory()
}
