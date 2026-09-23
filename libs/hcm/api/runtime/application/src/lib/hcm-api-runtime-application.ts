import {
	HcmRuntimeError,
	HcmSessionReader,
	TenantDirectory,
	normalizeTenantHost,
	type TenantRecord,
	type HcmSessionRequest,
} from '@empflowyee/hcm-api-runtime-domain'
import {
	isTenantAccessible,
	type HcmRuntimeContext,
	type TenantDiscoveryResponse,
} from '@empflowyee/hcm-runtime-contract'
export {
	HcmRuntimeError,
	HcmSessionReader,
	TenantDirectory,
	type TenantRecord,
	type HcmSessionRequest,
} from '@empflowyee/hcm-api-runtime-domain'

export interface AuthenticatedHcmContext {
	readonly session: HcmRuntimeContext
}

const authenticatedScopes = new WeakMap<
	AuthenticatedHcmContext,
	{ tenantId: string; expiresAt: number }
>()

/** Accept only a still-valid context issued by server verification, never a copied public DTO. */
export function requireAuthenticatedTenant(context: AuthenticatedHcmContext): string {
	const scope = authenticatedScopes.get(context)
	if (!scope || scope.expiresAt <= Date.now()) throw new HcmRuntimeError('unauthenticated')
	return scope.tenantId
}

export class HcmRuntimeApplication {
	/** Bind framework-neutral tenant and verified-session ports at the module composition boundary. */
	constructor(
		private readonly tenants: TenantDirectory,
		private readonly sessions: HcmSessionReader,
	) {}

	/** Establish authority from the exact preserved ingress Host, never query/body tenant identifiers. */
	async resolveTenant(host: string | undefined, peerAddress?: string): Promise<TenantRecord> {
		const tenant = await this.tenants.findByHost(normalizeTenantHost(host), peerAddress)
		if (!tenant) throw new HcmRuntimeError('tenant-not-found')
		return tenant
	}

	/** Explicitly project the public allowlist so internal records cannot leak through object spreads. */
	discover(record: TenantRecord): TenantDiscoveryResponse {
		const { tenant, authentication } = record.discovery
		const defaults = tenant.defaults
		return {
			tenant: {
				slug: tenant.slug,
				displayName: tenant.displayName,
				status: tenant.status,
				logoUrl: tenant.logoUrl,
				primaryColor: tenant.primaryColor,
				allowUserTheme: tenant.allowUserTheme,
				defaults: {
					theme: defaults.theme,
					language: defaults.language,
					locale: defaults.locale,
					timezone: defaults.timezone,
					dateFormat: defaults.dateFormat,
					timeFormat: defaults.timeFormat,
					numberFormat: defaults.numberFormat,
					density: defaults.density,
				},
			},
			authentication: {
				strategies: [...authentication.strategies],
				loginPath: authentication.loginPath,
			},
		}
	}

	/** Independently require an active tenant, verified unexpired session and matching tenant membership. */
	async session(
		record: TenantRecord,
		cookie?: string,
		request?: HcmSessionRequest,
	): Promise<HcmRuntimeContext> {
		return (await this.authenticate(record, cookie, request)).session
	}

	/** Issue an internal scope after tenant status, session expiry and membership are verified. */
	async authenticate(
		record: TenantRecord,
		cookie?: string,
		request?: HcmSessionRequest,
	): Promise<AuthenticatedHcmContext> {
		if (!isTenantAccessible(record.discovery.tenant)) throw new HcmRuntimeError('tenant-suspended')
		const session = await this.sessions.read(cookie, { ...request, tenantId: record.id })
		if (
			!session ||
			!Number.isFinite(Date.parse(session.expiresAt)) ||
			Date.parse(session.expiresAt) <= Date.now()
		)
			throw new HcmRuntimeError('unauthenticated')
		if (session.tenantId !== record.id) throw new HcmRuntimeError('forbidden')
		const context: AuthenticatedHcmContext = Object.freeze({
			session: {
				tenant: this.discover(record).tenant,
				user: session.user,
				access: session.access,
				preferences: session.preferences,
				session: { version: session.version, expiresAt: session.expiresAt },
				...(session.development ? { development: session.development } : {}),
			},
		})
		authenticatedScopes.set(context, {
			tenantId: record.id,
			expiresAt: Date.parse(session.expiresAt),
		})
		return context
	}
}
