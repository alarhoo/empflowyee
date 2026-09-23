import 'reflect-metadata'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { request } from 'node:http'
import {
	HcmSessionReader,
	TenantDirectory,
	type TenantRecord,
} from '@empflowyee/hcm-api-runtime-application'
import type { VerifiedHcmSession } from '@empflowyee/hcm-api-runtime-domain'
import {
	createTenantDirectory,
	createSessionReader,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import { HcmRuntimeModule } from './hcm-api-runtime-module'

const tenant: TenantRecord = {
	id: 'internal-acme',
	discovery: {
		tenant: {
			slug: 'acme',
			displayName: 'Acme',
			status: 'active',
			allowUserTheme: true,
			defaults: { locale: 'en-IN' },
		},
		authentication: { strategies: [] },
	},
}
const verified: VerifiedHcmSession = {
	tenantId: tenant.id,
	user: { id: 'test-user', displayName: 'Test User', employeeId: 'employee-private' },
	access: {
		roles: ['employee'],
		permissions: ['employee.directory.read'],
		entitlements: ['employee-core'],
		featureFlags: [],
	},
	preferences: {},
	version: 'v1',
	expiresAt: '2099-01-01T00:00:00.000Z',
}

/** Send an exact Host through Node HTTP; fetch may replace forbidden authority headers. */
function runtimeRequest(
	url: string,
	options: { headers: Record<string, string> },
): Promise<Response> {
	return new Promise(
		/** Collect the real HTTP boundary response for assertions. */ (resolve, reject) => {
			const req = request(
				url,
				options,
				/** Convert the completed Node response into a standard readable response. */ (res) => {
					let body = ''
					res.on(
						'data',
						/** Collect the JSON body without inspecting server internals. */ (chunk) => {
							body += String(chunk)
						},
					)
					res.on(
						'end',
						/** Complete the public response after the HTTP stream ends. */ () =>
							resolve(new Response(body, { status: res.statusCode })),
					)
				},
			)
			req.on('error', reject)
			req.end()
		},
	)
}

describe('HCM runtime HTTP boundary', /** Exercise real Nest routing, request scope, safe errors and authentication ports over HTTP. */ () => {
	let app: INestApplication
	let origin: string
	let record: TenantRecord
	let session: VerifiedHcmSession | null
	beforeEach(
		/** Bind deterministic test adapters without installing a production authentication bypass. */ async () => {
			record = structuredClone(tenant)
			session = null
			const module = await Test.createTestingModule({ imports: [HcmRuntimeModule] })
				.overrideProvider(TenantDirectory)
				.useValue({
					findByHost: /** Resolve only the explicitly registered tenant host. */ async (
						host: string,
					) => (host === 'acme.localhost' ? record : null),
				})
				.overrideProvider(HcmSessionReader)
				.useValue({
					read: /** Model the output of an already verified server-side session adapter. */ async () =>
						session,
				})
				.compile()
			app = module.createNestApplication({ logger: false })
			app.setGlobalPrefix('api')
			await app.listen(0, '127.0.0.1')
			origin = await app.getUrl()
		},
	)
	afterEach(
		/** Release the HTTP listener and request-scoped providers after each test. */ async () => {
			await app.close()
		},
	)

	it('returns only safe discovery and ignores body/query tenant overrides and forwarded hosts', /** Send hostile tenant hints through real HTTP and verify exact pre-auth fields. */ async () => {
		const response = await new Promise<{
			status: number | undefined
			body: string
			headers: Record<string, unknown>
		}>(
			/** Include a GET body to prove transport authority never reads it. */ (resolve, reject) => {
				const req = request(
					`${origin}/api/v1/runtime/tenant?tenant_id=other`,
					{
						method: 'GET',
						headers: {
							host: 'acme.localhost:4302',
							'x-forwarded-host': 'other.localhost',
							'content-type': 'application/json',
							'content-length': 21,
							'x-request-id': 'test-request-1',
						},
					},
					/** Collect the response without interpreting internal server state. */ (res) => {
						let body = ''
						res.on(
							'data',
							/** Accumulate the public JSON payload. */ (chunk) => {
								body += String(chunk)
							},
						)
						res.on(
							'end',
							/** Return status and headers with the completed body. */ () =>
								resolve({ status: res.statusCode, body, headers: res.headers }),
						)
					},
				)
				req.on('error', reject)
				req.end('{"tenant_id":"other"}')
			},
		)
		expect(response.status).toBe(200)
		expect(JSON.parse(response.body)).toEqual(record.discovery)
		expect(response.body).not.toMatch(
			/internal-acme|employee-private|permissions|entitlements|roles|user/,
		)
		expect(response.headers['cache-control']).toBe('no-store')
		expect(response.headers['x-request-id']).toBe('test-request-1')
	})

	it('does not resolve tenants from forwarded host or browser tenant IDs', /** An unknown Host cannot be rescued by attacker-controlled context hints. */ async () => {
		const response = await runtimeRequest(
			`${origin}/api/v1/runtime/tenant?tenant_id=internal-acme`,
			{
				headers: { host: 'unknown.localhost', 'x-forwarded-host': 'acme.localhost' },
			},
		)
		expect(response.status).toBe(404)
		expect(await response.json()).toMatchObject({ code: 'tenant-not-found' })
	})

	it('requires an authenticated session then returns the typed context', /** Keep identity, permissions and licensed access behind the verified session port. */ async () => {
		const url = `${origin}/api/v1/runtime/session`
		expect(
			(
				await runtimeRequest(url, {
					headers: { host: 'acme.localhost', cookie: 'made-up-session=admin' },
				})
			).status,
		).toBe(401)
		session = structuredClone(verified)
		const response = await runtimeRequest(url, { headers: { host: 'acme.localhost' } })
		expect(response.status).toBe(200)
		expect(await response.json()).toMatchObject({
			tenant: record.discovery.tenant,
			user: verified.user,
			access: verified.access,
		})
	})

	it('rejects cross-tenant membership and expired sessions independently', /** A verified identity cannot override request tenant authority or session expiry. */ async () => {
		session = { ...verified, tenantId: 'different-tenant' }
		expect(
			(
				await runtimeRequest(`${origin}/api/v1/runtime/session`, {
					headers: { host: 'acme.localhost' },
				})
			).status,
		).toBe(403)
		session = { ...verified, expiresAt: '2000-01-01T00:00:00Z' }
		expect(
			(
				await runtimeRequest(`${origin}/api/v1/runtime/session`, {
					headers: { host: 'acme.localhost' },
				})
			).status,
		).toBe(401)
	})

	it.each(['suspended', 'deactivated'] as const)(
		'returns public %s status but denies session access',
		/** Check lifecycle on the backend even for a valid session. */ async (status) => {
			record.discovery.tenant.status = status
			session = verified
			const discovery = await runtimeRequest(`${origin}/api/v1/runtime/tenant`, {
				headers: { host: 'acme.localhost' },
			})
			expect(discovery.status).toBe(200)
			expect(await discovery.json()).toMatchObject({ tenant: { status } })
			expect(
				(
					await runtimeRequest(`${origin}/api/v1/runtime/session`, {
						headers: { host: 'acme.localhost' },
					})
				).status,
			).toBe(423)
		},
	)
})

it('requires persisted stores and rejects unsafe local activation', /** Local flags cannot activate fixtures, remote environments or production authentication. */ async () => {
	const enabled = {
		APP_ENVIRONMENT: 'local',
		NODE_ENV: 'test',
		HCM_LOCAL_TENANTS: 'true',
		HCM_LOCAL_SESSION: 'true',
	}
	for (const override of [
		{ APP_ENVIRONMENT: 'qa' },
		{ APP_ENVIRONMENT: 'prod' },
		{ NODE_ENV: 'production' },
		{ K_SERVICE: 'cloud' },
	]) {
		expect(
			/** Reject local discovery in nonlocal environments. */ () =>
				createTenantDirectory({ ...enabled, ...override }),
		).toThrow()
		expect(
			/** Reject local sessions in nonlocal environments. */ () =>
				createSessionReader({ ...enabled, ...override }),
		).toThrow()
	}
	expect(
		/** Refuse an in-memory fallback when PostgreSQL is not supplied. */ () =>
			createTenantDirectory(enabled),
	).toThrow('database store')
	expect(
		/** Refuse session fixtures when PostgreSQL is not supplied. */ () =>
			createSessionReader(enabled),
	).toThrow('database store')
	await expect(createTenantDirectory({}).findByHost('acme.localhost')).rejects.toThrow(
		'runtime-unavailable',
	)
	expect(
		await createSessionReader({}).read(undefined, {
			peerAddress: '127.0.0.1',
			developmentPersona: 'david',
		}),
	).toBeNull()
})
