import 'reflect-metadata'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { request } from 'node:http'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from 'pg'
import { migrateHcmDatabase, loadSqlMigrations } from '@empflowyee/hcm-api-database-migrations'
import { runDevelopmentSeeds } from '@empflowyee/hcm-api-database-seed'
import {
	FieldCipher,
	HcmSessionReader,
	TenantDirectory,
} from '@empflowyee/hcm-api-runtime-application'
import {
	HcmRuntimeStore,
	LocalFieldCipher,
	createTenantDirectory,
	createSessionReader,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import { HCM_ROLE_WRITE_ORIGIN } from '@empflowyee/hcm-api-access-control-transport'
import { DocumentFiles } from '@empflowyee/hcm-api-documents-application'
import {
	LocalDocumentFiles,
	provisionDocumentRoot,
} from '@empflowyee/hcm-api-documents-infrastructure'

export const HCM_TEST_TENANT = 'local-dunder-mifflin'
export const HCM_TEST_ORIGIN = 'http://acme.localhost:4302'
const env = {
	APP_ENVIRONMENT: 'local',
	NODE_ENV: 'test',
	HCM_LOCAL_TENANTS: 'true',
	HCM_LOCAL_SESSION: 'true',
}

export interface HcmReply<T> {
	status: number
	body: T
	cache: string | undefined
}
export interface HcmTestApi {
	/** Send one real HTTP request as a persisted development persona. */
	send<T = Record<string, unknown>>(
		persona: string,
		method: string,
		path: string,
		body?: unknown,
		headers?: Record<string, string>,
	): Promise<HcmReply<T>>
	/** Send one multipart upload: a JSON `metadata` part, then one `file` part. */
	upload<T = Record<string, unknown>>(
		persona: string,
		path: string,
		metadata: unknown,
		file?: { name: string; type: string; bytes: Buffer },
	): Promise<HcmReply<T>>
	/** Migrator connection with tenant context for arranging and inspecting rows. */
	admin: Client
	/** Close the application and connections. */
	close(): Promise<void>
}

/** A reply body: non-JSON text as is, JSON parsed, or null when empty. */
function decode(text: string, raw: boolean): never {
	if (raw) return text as never
	return (text ? JSON.parse(text) : null) as never
}

/**
 * Migrate and seed the disposable database (mirrors the workforce harness), then start the real Nest module over the restricted
 * runtime role so tests exercise routing, authorization, RLS and persistence together.
 */
export async function startHcmTestApi(module: unknown): Promise<HcmTestApi> {
	const migrator = process.env['HCM_TEST_MIGRATOR'],
		runtime = process.env['HCM_TEST_RUNTIME']
	if (!migrator || !runtime) throw new Error('Disposable database required')
	const admin = new Client({ connectionString: migrator })
	await admin.connect()
	await admin.query('DROP SCHEMA IF EXISTS hcm CASCADE')
	const inventory = resolve('libs/hcm/api/database/migrations/sql')
	await migrateHcmDatabase(migrator, inventory)
	await runDevelopmentSeeds({
		env: { ...env, HCM_SEED_TARGET: HCM_TEST_TENANT, HCM_SEED_DATABASE_URL: migrator },
		manifestDirectory: resolve('libs/hcm/api/database/seed/manifest'),
		migrations: await loadSqlMigrations(inventory),
	})
	await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [HCM_TEST_TENANT])
	const store = new HcmRuntimeStore(runtime)
	const home = await mkdtemp(join(tmpdir(), 'hcm-employee-files-'))
	await provisionDocumentRoot(join(home, 'private'))
	const compiled = await Test.createTestingModule({ imports: [module as never] })
		.overrideProvider(HcmRuntimeStore)
		.useValue(store)
		.overrideProvider(TenantDirectory)
		.useValue(createTenantDirectory(env, store))
		.overrideProvider(HcmSessionReader)
		.useValue(createSessionReader(env, store))
		.overrideProvider(HcmAccessDatabase)
		.useValue(new HcmAccessDatabase(runtime))
		.overrideProvider(HCM_ROLE_WRITE_ORIGIN)
		.useValue(HCM_TEST_ORIGIN)
		// Job architecture reads positions for capacity; its cipher uses a disposable local key here.
		.overrideProvider(FieldCipher)
		.useValue(new LocalFieldCipher(randomBytes(32)))
		// Import sources are staged in a disposable private document root.
		.overrideProvider(DocumentFiles)
		.useValue(new LocalDocumentFiles(join(home, 'private')))
		.compile()
	const app: INestApplication = compiled.createNestApplication({ logger: false })
	app.setGlobalPrefix('api')
	await app.listen(0, '127.0.0.1')
	const origin = await app.getUrl()
	return {
		admin,
		/** Encode one multipart body and send it through `send`'s transport. */
		upload<T>(
			this: HcmTestApi,
			persona: string,
			path: string,
			metadata: unknown,
			file?: { name: string; type: string; bytes: Buffer },
		) {
			const boundary = `hcm-${randomUUID()}`
			const parts = [
				Buffer.from(
					`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify(metadata)}\r\n`,
				),
			]
			if (file)
				parts.push(
					Buffer.from(
						`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`,
					),
					file.bytes,
					Buffer.from('\r\n'),
				)
			parts.push(Buffer.from(`--${boundary}--\r\n`))
			const body = Buffer.concat(parts)
			return this.send<T>(persona, 'POST', path, body, {
				'content-type': `multipart/form-data; boundary=${boundary}`,
			})
		},
		/** Send one request with browser-like same-origin write headers. */
		send<T>(
			persona: string,
			method: string,
			path: string,
			body?: unknown,
			headers: Record<string, string> = {},
		) {
			let payload: string | Buffer = ''
			if (Buffer.isBuffer(body)) payload = body
			else if (body !== undefined) payload = JSON.stringify(body)
			return new Promise<HcmReply<T>>(
				/** Collect the real response. */ (resolveReply, reject) => {
					const call = request(
						`${origin}/api/v1/${path}`,
						{
							method,
							headers: {
								host: 'acme.localhost',
								'x-hcm-development-persona': persona,
								origin: HCM_TEST_ORIGIN,
								'sec-fetch-site': 'same-origin',
								'content-type': 'application/json',
								'idempotency-key': randomUUID(),
								'content-length': String(Buffer.byteLength(payload)),
								...headers,
							},
						},
						/** Decode JSON output. */ (response) => {
							let text = ''
							response.on('data', /** Collect chunks. */ (chunk) => (text += String(chunk)))
							const raw = !String(response.headers['content-type'] ?? '').includes('json')
							response.on(
								'end',
								/** Resolve with status and body. */ () =>
									resolveReply({
										status: response.statusCode ?? 0,
										body: decode(text, raw),
										cache: response.headers['cache-control'],
									}),
							)
						},
					)
					call.on('error', reject)
					call.end(payload || undefined)
				},
			)
		},
		/** Drain the app before closing the migrator connection. */
		async close() {
			await app.close()
			await admin.end()
			await rm(home, { recursive: true, force: true })
		},
	}
}
