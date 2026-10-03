import 'reflect-metadata'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { Client } from 'pg'
import { randomBytes, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { request } from 'node:http'
import { loadSqlMigrations, migrateHcmDatabase } from '@empflowyee/hcm-api-database-migrations'
import { runDevelopmentSeeds } from '@empflowyee/hcm-api-database-seed'
import {
	FieldCipher,
	HcmSessionReader,
	TenantDirectory,
} from '@empflowyee/hcm-api-runtime-application'
import {
	createSessionReader,
	createTenantDirectory,
	HcmRuntimeStore,
	LocalFieldCipher,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import { HCM_ROLE_WRITE_ORIGIN } from '@empflowyee/hcm-api-access-control-transport'
import { HcmLeaveModule } from './hcm-api-leave-module'

const tenant = 'local-dunder-mifflin',
	origin = 'http://acme.localhost:4302'
const environment = {
	APP_ENVIRONMENT: 'local',
	NODE_ENV: 'test',
	HCM_LOCAL_TENANTS: 'true',
	HCM_LOCAL_SESSION: 'true',
}
let app: INestApplication, admin: Client, base: string

/** Use only the uniquely provisioned test database, never local application credentials. */
function connection(role: string): string {
	const value = process.env[`HCM_TEST_${role}`]
	if (!value) throw new Error('Disposable PostgreSQL required')
	return value
}
/** Send a real HTTP request through Nest authentication, origin checks and exception mapping. */
async function send(
	persona: string,
	method: string,
	path: string,
	body?: unknown,
	headers: Record<string, string> = {},
	resource: 'policies' | 'policy-options' = 'policies',
) {
	const payload = body === undefined ? '' : JSON.stringify(body)
	return new Promise<{
		status: number
		cache: string | undefined
		body: ReturnType<typeof JSON.parse>
	}>(
		/** Use node:http so the test's tenant Host header reaches the real request boundary. */ (
			resolveReply,
			reject,
		) => {
			const call = request(
				`${base}/api/v1/leave/${resource}${path}`,
				{
					method,
					headers: {
						host: 'acme.localhost',
						origin,
						'sec-fetch-site': 'same-origin',
						'content-type': 'application/json',
						'x-hcm-development-persona': persona,
						'idempotency-key': randomUUID(),
						'content-length': String(Buffer.byteLength(payload)),
						...headers,
					},
				},
				/** Decode only the real server response. */ (response) => {
					let text = ''
					response.on(
						'data',
						/** Accumulate the response body. */ (chunk) => {
							text += String(chunk)
						},
					)
					response.on(
						'end',
						/** Return safe transport status and decoded fixture data. */ () => {
							try {
								resolveReply({
									status: response.statusCode ?? 0,
									cache: response.headers['cache-control'],
									body: JSON.parse(text),
								})
							} catch (error) {
								reject(error)
							}
						},
					)
				},
			)
			call.on('error', reject)
			call.end(payload)
		},
	)
}
/** An explicit incomplete draft tests the real editor's save-before-publication contract. */
function input() {
	return {
		code: `P_${randomUUID().replaceAll('-', '').toUpperCase()}`,
		name: 'HTTP vacation draft',
		leaveTypeId: 'http-vac',
		effectiveFrom: '2026-01-01',
		trackingMode: 'Balance',
		unit: 'Day',
		eligibility: { workerTypes: [], legalEntityIds: [] },
		eligibilityRules: [],
		datedAssignments: [],
		rounding: { scale: 6, mode: 'Nearest' },
		accrual: { enabled: true, unitsPerYear: '24', unitsPerMonth: '2' },
		carryForward: { enabled: false },
		noticeMode: 'Warning',
		approvalRules: [],
		compOff: { enabled: false },
		encashment: { configured: false, annualOnly: true },
		bridgeRule: 'None',
		blackoutDates: [],
		allowOverlap: false,
		negativeBalanceAllowed: false,
		postingPoint: 'OnApproval',
	}
}
beforeAll(
	/** Start the real Leave module over restricted PostgreSQL with canonical local authentication. */ async () => {
		const migrator = connection('MIGRATOR'),
			runtime = connection('RUNTIME')
		admin = new Client({ connectionString: migrator })
		await admin.connect()
		await admin.query('DROP SCHEMA IF EXISTS hcm CASCADE')
		const inventory = resolve('libs/hcm/api/database/migrations/sql')
		await migrateHcmDatabase(migrator, inventory)
		await runDevelopmentSeeds({
			env: { ...environment, HCM_SEED_TARGET: tenant, HCM_SEED_DATABASE_URL: migrator },
			manifestDirectory: resolve('libs/hcm/api/database/seed/manifest'),
			migrations: await loadSqlMigrations(inventory),
		})
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		await admin.query(
			"INSERT INTO hcm.leave_type(tenant_id,id,code,name,category,unit,is_paid,is_sensitive,is_active) VALUES($1,'http-vac','HTTP_VAC','HTTP fixture','Annual','Day',true,false,true)",
			[tenant],
		)
		await admin.query(
			"INSERT INTO hcm.access_permission(tenant_id,code,description,kind) VALUES($1,'hcm.leave.leave-policies.read','Read policies','business-operation'),($1,'hcm.leave.leave-policies.draft','Draft policies','business-operation')",
			[tenant],
		)
		await admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'tenant-administrator','hcm.leave.leave-policies.read'),($1,'tenant-administrator','hcm.leave.leave-policies.draft')",
			[tenant],
		)
		const store = new HcmRuntimeStore(runtime)
		const compiled = await Test.createTestingModule({ imports: [HcmLeaveModule] })
			.overrideProvider(FieldCipher)
			.useValue(new LocalFieldCipher(randomBytes(32)))
			.overrideProvider(HcmRuntimeStore)
			.useValue(store)
			.overrideProvider(TenantDirectory)
			.useValue(createTenantDirectory(environment, store))
			.overrideProvider(HcmSessionReader)
			.useValue(createSessionReader(environment, store))
			.overrideProvider(HcmAccessDatabase)
			.useValue(new HcmAccessDatabase(runtime))
			.overrideProvider(HCM_ROLE_WRITE_ORIGIN)
			.useValue(origin)
			.compile()
		app = compiled.createNestApplication({ logger: false })
		app.setGlobalPrefix('api')
		await app.listen(0, '127.0.0.1')
		base = await app.getUrl()
	},
)
afterAll(
	/** Stop the suite's HTTP listener and its own PostgreSQL connections. */ async () => {
		await app?.close()
		await admin?.end()
	},
)

it('saves, reloads and updates a real policy with safe retries and stale revision errors', /** Verify business effects beyond an HTTP success status. */ async () => {
	const body = input(),
		key = randomUUID()
	const created = await send('david', 'POST', '', body, { 'idempotency-key': key })
	expect(created.status, JSON.stringify(created.body)).toBe(201)
	expect(created.body).toMatchObject({ code: body.code, revision: 1, state: 'Draft' })
	expect(created.body.validation).toContainEqual({ field: 'accrual.timing', code: 'required' })
	expect((await send('david', 'POST', '', body, { 'idempotency-key': key })).body).toEqual(
		created.body,
	)
	const path = `/${created.body.id}/versions/${created.body.versionId}`
	const reloaded = await send('david', 'GET', path)
	expect(reloaded.status).toBe(200)
	expect(reloaded.body).toEqual(created.body)
	expect(reloaded.cache).toContain('no-store')
	const changed = await send('david', 'PATCH', path, {
		...body,
		expectedRevision: 1,
		name: 'Changed in API',
	})
	expect(changed.status).toBe(200)
	expect(changed.body.revision).toBe(2)
	expect((await send('david', 'PATCH', path, { ...body, expectedRevision: 1 })).status).toBe(409)
	expect((await send('david', 'GET', path)).body.name).toBe('Changed in API')
	const list = await send('david', 'GET', `?id=${created.body.id}`)
	expect(list.status).toBe(200)
	expect(list.body.items).toHaveLength(1)
	expect(list.body.items[0].revision).toBe(2)
	expect((await send('david', 'GET', '?sort=tenantId')).status).toBe(400)
	expect(
		(await admin.query('SELECT id FROM hcm.leave_policy WHERE code=$1', [body.code])).rows,
	).toHaveLength(1)
})

it('rejects missing operation grants, cross-origin writes and hidden tenant or state fields', /** A discoverable route cannot bypass independent backend authority and validation. */ async () => {
	expect((await send('jim', 'POST', '', input())).status).toBe(403)
	expect(
		(await send('david', 'POST', '', input(), { origin: 'https://foreign.invalid' })).status,
	).toBe(403)
	expect((await send('david', 'POST', '', { ...input(), tenantId: 'foreign' })).status).toBe(400)
	expect((await send('david', 'POST', '', { ...input(), state: 'Published' })).status).toBe(400)
	expect(
		(await send('david', 'POST', '', { ...input(), accrual: { enabled: true, unitsPerMonth: 2 } }))
			.status,
	).toBe(400)
	expect((await send('david', 'GET', '/foreign/versions/foreign')).status).toBe(404)
	expect((await send('david', 'POST', '/foreign/versions/foreign/publish', {})).status).toBe(404)
})

it('loads policy type options from the tenant database under source read authority', /** The picker never substitutes fixture arrays in production or exposes internal type columns. */ async () => {
	const result = await send('david', 'GET', '?id=http-vac', undefined, {}, 'policy-options')
	expect(result.status).toBe(200)
	expect(result.body).toEqual({
		leaveTypes: [
			{
				id: 'http-vac',
				label: 'HTTP fixture',
				code: 'HTTP_VAC',
				unit: 'Day',
				category: 'Annual',
				revision: 1,
				state: 'Active',
			},
		],
		nextCursor: null,
	})
	expect((await send('jim', 'GET', '', undefined, {}, 'policy-options')).status).toBe(403)
	expect(
		(await send('david', 'GET', '?tenantId=foreign', undefined, {}, 'policy-options')).status,
	).toBe(400)
})
