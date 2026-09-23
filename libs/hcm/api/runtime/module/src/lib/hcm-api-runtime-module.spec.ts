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

it('restricts local discovery to opted-in non-cloud development and loopback callers', /** Prevent fixture flags alone from enabling fake production tenant authority. */ async () => {
	for (const env of [
		{ APP_ENVIRONMENT: 'prod' },
		{ APP_ENVIRONMENT: 'local', NODE_ENV: 'production' },
		{ APP_ENVIRONMENT: 'local', K_SERVICE: 'cloud-service' },
	]) {
		expect(
			/** Try the prohibited fixture configuration. */ () =>
				createTenantDirectory({ ...env, HCM_LOCAL_TENANTS: 'true' }),
		).toThrow()
	}
	const directory = createTenantDirectory({
		APP_ENVIRONMENT: 'local',
		NODE_ENV: 'development',
		HCM_LOCAL_TENANTS: 'true',
	})
	expect(await directory.findByHost('acme.localhost', '127.0.0.1')).toMatchObject({
		discovery: { tenant: { status: 'active' } },
	})
	expect(await directory.findByHost('acme.localhost', '10.0.0.2')).toBeNull()
	await expect(createTenantDirectory({}).findByHost('acme.localhost')).rejects.toThrow(
		'runtime-unavailable',
	)
})

it('serves server-owned development personas through the real HTTP runtime boundary', /** Verify default local login, persona selection and independent tenant membership checks. */ async () => {
	const env = { APP_ENVIRONMENT: 'local', HCM_LOCAL_TENANTS: 'true', HCM_LOCAL_SESSION: 'true' }
	const module = await Test.createTestingModule({ imports: [HcmRuntimeModule] })
		.overrideProvider(TenantDirectory)
		.useValue(createTenantDirectory(env))
		.overrideProvider(HcmSessionReader)
		.useValue(createSessionReader(env))
		.compile()
	const app = module.createNestApplication({ logger: false })
	app.setGlobalPrefix('api')
	await app.listen(0, '127.0.0.1')
	try {
		const url = `${await app.getUrl()}/api/v1/runtime/session`
		const initial = await runtimeRequest(url, { headers: { host: 'acme.localhost' } })
		expect(initial.status).toBe(200)
		expect(await initial.json()).toMatchObject({
			tenant: { displayName: 'Dunder Mifflin' },
			user: { displayName: 'Jim Halpert' },
			development: { personaId: 'jim', catalogueInspection: true },
		})
		for (const [id, displayName] of [
			['michael', 'Michael Scott'],
			['toby', 'Toby Flenderson'],
			['david', 'David Wallace'],
		]) {
			const response = await runtimeRequest(url, {
				headers: { host: 'acme.localhost', 'x-hcm-development-persona': id },
			})
			expect(response.status).toBe(200)
			expect(await response.json()).toMatchObject({
				user: { displayName },
				development: { personaId: id },
			})
		}
		expect(
			(
				await runtimeRequest(url, {
					headers: { host: 'acme.localhost', 'x-hcm-development-persona': 'unknown' },
				})
			).status,
		).toBe(401)
		expect((await runtimeRequest(url, { headers: { host: 'trial.localhost' } })).status).toBe(403)
		expect((await runtimeRequest(url, { headers: { host: 'suspended.localhost' } })).status).toBe(
			423,
		)
	} finally {
		await app.close()
	}
})

it('never activates local sessions implicitly or for non-local callers', /** Guard the new local trust boundary and ensure disabled adapters ignore persona headers. */ async () => {
	const enabled = { APP_ENVIRONMENT: 'local', HCM_LOCAL_TENANTS: 'true', HCM_LOCAL_SESSION: 'true' }
	for (const overrides of [
		{ APP_ENVIRONMENT: 'prod' },
		{ APP_ENVIRONMENT: 'qa' },
		{ NODE_ENV: 'production' },
		{ K_SERVICE: 'hcm-api' },
		{ HCM_LOCAL_TENANTS: 'false' },
	]) {
		expect(
			/** Reject unsafe local adapter configuration at startup. */ () =>
				createSessionReader({ ...enabled, ...overrides }),
		).toThrow()
	}
	expect(
		await createSessionReader({}).read(undefined, {
			peerAddress: '127.0.0.1',
			developmentPersona: 'david',
		}),
	).toBeNull()
	expect(await createSessionReader(enabled).read(undefined, { peerAddress: '10.0.0.2' })).toBeNull()
	expect(await createSessionReader(enabled).read(undefined)).toBeNull()
})
