import { afterAll, beforeAll, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { Client, Pool } from 'pg'
import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely'
import { migrateHcmDatabase } from '@empflowyee/hcm-api-database-migrations'
import type { SealedValue } from '@empflowyee/hcm-api-runtime-application'
import {
	LocalFieldCipher,
	UnavailableFieldCipher,
	createFieldCipher,
} from '@empflowyee/hcm-api-runtime-infrastructure'

const TENANT = 'local-dunder-mifflin'
const OTHER = 'local-other-tenant'
let admin: Client
let runtime: Kysely<unknown>
const kek = randomBytes(32)
const target = { table: 'position_change_request', column: 'encrypted_reason', rowId: 'r1' }

/** Run as the restricted runtime role inside one committed tenant transaction. */
async function inTenant<T>(
	tenant: string,
	work: (trx: Transaction<unknown>) => Promise<T>,
): Promise<T> {
	return runtime.transaction().execute(
		/** Install tenant context, then run. */ async (trx) => {
			await sql`SELECT set_config('hcm.tenant_id', ${tenant}, true)`.execute(trx)
			return work(trx)
		},
	)
}

beforeAll(
	/** Migrate the disposable database and create two tenants. */ async () => {
		const migrator = process.env['HCM_TEST_MIGRATOR']
		const runtimeUrl = process.env['HCM_TEST_RUNTIME']
		if (!migrator || !runtimeUrl) throw new Error('Disposable database required')
		admin = new Client({ connectionString: migrator })
		await admin.connect()
		await admin.query('DROP SCHEMA IF EXISTS hcm CASCADE')
		await migrateHcmDatabase(migrator, resolve('libs/hcm/api/database/migrations/sql'))
		for (const tenant of [TENANT, OTHER]) {
			await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
			await admin.query(
				"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES ($1,$1,$1,'active') ON CONFLICT DO NOTHING",
				[tenant],
			)
		}
		runtime = new Kysely({
			dialect: new PostgresDialect({ pool: new Pool({ connectionString: runtimeUrl, max: 2 }) }),
		})
	},
)
afterAll(
	/** Release connections. */ async () => {
		await runtime?.destroy()
		await admin?.end()
	},
)

it('seals values bound to tenant, table, column and row with a wrapped tenant key', /** ADR decisions 1–3. */ async () => {
	const cipher = new LocalFieldCipher(kek)
	const sealed = await inTenant(
		TENANT,
		/** Encrypt. */ (trx) => cipher.bind(trx, TENANT).encrypt(target, 'Budget moved to Stamford'),
	)
	expect(sealed.keyVersion).toBe(1)
	expect(sealed.ciphertext.toString('utf8')).not.toContain('Stamford')
	expect(
		await inTenant(
			TENANT,
			/** Decrypt. */ (trx) => cipher.bind(trx, TENANT).decrypt(target, sealed),
		),
	).toBe('Budget moved to Stamford')
	// A fresh process unwraps the stored key; the same value encrypts differently each time.
	const restarted = new LocalFieldCipher(kek)
	expect(
		await inTenant(
			TENANT,
			/** Decrypt after restart. */ (trx) => restarted.bind(trx, TENANT).decrypt(target, sealed),
		),
	).toBe('Budget moved to Stamford')
	const again = await inTenant(
		TENANT,
		/** Encrypt again. */ (trx) =>
			cipher.bind(trx, TENANT).encrypt(target, 'Budget moved to Stamford'),
	)
	expect(again.ciphertext.equals(sealed.ciphertext)).toBe(false)
	await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [TENANT])
	const stored = await admin.query<{ n: number; wrapped: Buffer; reference: string }>(
		'SELECT count(*) OVER ()::int AS n,wrapped_key AS wrapped,kek_reference AS reference FROM hcm.tenant_field_key WHERE tenant_id=$1',
		[TENANT],
	)
	expect(stored.rows).toHaveLength(1)
	expect(stored.rows[0]?.reference).toMatch(/^local:[0-9a-f]{16}$/)
	expect(stored.rows[0]?.wrapped.includes(kek)).toBe(false)
})

it('refuses values copied to another row, column or tenant, or tampered with', /** ADR decision 1. */ async () => {
	const cipher = new LocalFieldCipher(kek)
	const sealed = await inTenant(
		TENANT,
		/** Encrypt. */ (trx) => cipher.bind(trx, TENANT).encrypt(target, 'secret'),
	)
	/** Try to open a value somewhere else. */
	const attempt = (tenant: string, where: typeof target, value: SealedValue = sealed) =>
		inTenant(tenant, /** Decrypt. */ (trx) => cipher.bind(trx, tenant).decrypt(where, value))
	await expect(attempt(TENANT, { ...target, rowId: 'r2' })).rejects.toThrow()
	await expect(attempt(TENANT, { ...target, column: 'encrypted_comment' })).rejects.toThrow()
	// The other tenant gets its own key; this tenant's key is invisible to it under RLS.
	await expect(attempt(OTHER, target)).rejects.toThrow()
	const tampered = Buffer.from(sealed.ciphertext)
	tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1
	await expect(attempt(TENANT, target, { ...sealed, ciphertext: tampered })).rejects.toThrow()
	await expect(attempt(TENANT, target, { ...sealed, keyVersion: 9 })).rejects.toThrow('missing')
})

it('detects another key-encryption key and refuses without a configured key', /** ADR decisions 2 and 7. */ async () => {
	const sealed = await inTenant(
		TENANT,
		/** Encrypt. */ (trx) => new LocalFieldCipher(kek).bind(trx, TENANT).encrypt(target, 'secret'),
	)
	await expect(
		inTenant(
			TENANT,
			/** Another key. */ (trx) =>
				new LocalFieldCipher(randomBytes(32)).bind(trx, TENANT).decrypt(target, sealed),
		),
	).rejects.toThrow('wrapped by another key')
	expect(
		createFieldCipher({
			APP_ENVIRONMENT: 'production',
			HCM_LOCAL_FIELD_KEY: kek.toString('base64'),
		}),
	).toBeInstanceOf(UnavailableFieldCipher)
	expect(createFieldCipher({ APP_ENVIRONMENT: 'local' })).toBeInstanceOf(UnavailableFieldCipher)
	await expect(new UnavailableFieldCipher().bind().encrypt(target, 'secret')).rejects.toThrow(
		'not configured',
	)
	await expect(
		runtime.transaction().execute(
			/** The runtime cannot rewrite or delete keys. */ async (trx) => {
				await sql`SELECT set_config('hcm.tenant_id', ${TENANT}, true)`.execute(trx)
				await sql`UPDATE hcm.tenant_field_key SET retired_at=now()`.execute(trx)
			},
		),
	).rejects.toMatchObject({ code: '42501' })
})
