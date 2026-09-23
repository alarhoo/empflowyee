import {
	HcmSessionReader,
	type HcmSessionRequest,
	type VerifiedHcmSession,
} from '@empflowyee/hcm-api-runtime-domain'
import { HCM_CATALOGUE } from '@empflowyee/hcm-runtime-contract/catalogue'
import { UnconfiguredSessionReader } from './hcm-api-runtime-infrastructure'

const personas = [
	{ id: 'jim', displayName: 'Jim Halpert', roleLabel: 'Employee', role: 'employee' },
	{ id: 'michael', displayName: 'Michael Scott', roleLabel: 'Manager', role: 'manager' },
	{ id: 'toby', displayName: 'Toby Flenderson', roleLabel: 'HR Operations', role: 'hr-specialist' },
	{
		id: 'david',
		displayName: 'David Wallace',
		roleLabel: 'Tenant Administrator',
		role: 'tenant-administrator',
	},
] as const

export class LocalDevelopmentSessionReader extends HcmSessionReader {
	/** Resolve a server-owned persona only for the isolated loopback development runtime. */
	async read(
		_cookie: string | undefined,
		request?: HcmSessionRequest,
	): Promise<VerifiedHcmSession | null> {
		if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request?.peerAddress ?? '')) return null
		const persona = personas.find(
			/** Accept only the declared development persona IDs. */ (entry) =>
				entry.id === (request?.developmentPersona ?? 'jim'),
		)
		if (!persona) return null
		const role = HCM_CATALOGUE.businessRoles.find(
			/** Resolve the canonical role's discovery catalogue memberships. */ (entry) =>
				entry.roleId === persona.role,
		)
		const apps = HCM_CATALOGUE.apps.filter(
			/** Grant only explicitly mapped discovery capabilities for this persona. */ (app) =>
				app.catalogueIds.some(
					/** Match role membership without granting business API permissions. */ (id) =>
						role?.catalogueIds.includes(id),
				),
		)
		return {
			tenantId: 'local-dunder-mifflin',
			user: {
				id: `development-${persona.id}`,
				displayName: persona.displayName,
				email: `${persona.displayName.toLowerCase().replaceAll(' ', '.')}@dundermifflin.example`,
			},
			access: {
				roles: [persona.role],
				permissions: apps.map(
					/** Project server-side catalogue discovery permission identifiers. */ (app) =>
						app.discoveryPolicy.permission,
				),
				entitlements: HCM_CATALOGUE.domains.map(
					/** Keep tenant licensing stable across persona changes. */ (domain) =>
						`hcm.${domain.domain}`,
				),
				featureFlags: [],
			},
			preferences: {},
			version: `development-${persona.id}`,
			expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
			development: {
				personaId: persona.id,
				personas: personas.map(
					/** Expose only selection labels, never mutable server access assignments. */ ({
						id,
						displayName,
						roleLabel,
					}) => ({ id, displayName, roleLabel }),
				),
				catalogueInspection: true,
			},
		}
	}
}

/** Activate local sessions only through explicit local configuration; reject prohibited environments. */
export function createSessionReader(
	env: Readonly<Record<string, string | undefined>>,
): HcmSessionReader {
	if (env['HCM_LOCAL_SESSION'] !== 'true') return new UnconfiguredSessionReader()
	if (
		env['APP_ENVIRONMENT'] !== 'local' ||
		env['NODE_ENV'] === 'production' ||
		env['K_SERVICE'] ||
		env['HCM_LOCAL_TENANTS'] !== 'true'
	)
		throw new Error('Development sessions require isolated local tenant configuration')
	return new LocalDevelopmentSessionReader()
}
