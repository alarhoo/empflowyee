import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import type {
	BoundFieldCipher,
	CipherTarget,
	FieldCipher,
} from '@empflowyee/hcm-api-runtime-application'

const FORMAT = 1
const NONCE = 12
const TAG = 16

/** AES-256-GCM seal with associated data: format byte, nonce, ciphertext, tag. */
function seal(key: Buffer, plaintext: Buffer, aad: string): Buffer {
	const nonce = randomBytes(NONCE)
	const cipher = createCipheriv('aes-256-gcm', key, nonce)
	cipher.setAAD(Buffer.from(aad, 'utf8'))
	const body = Buffer.concat([cipher.update(plaintext), cipher.final()])
	return Buffer.concat([Buffer.from([FORMAT]), nonce, body, cipher.getAuthTag()])
}

/** Open a sealed buffer; any tampering or foreign associated data throws. */
function open(key: Buffer, sealed: Buffer, aad: string): Buffer {
	if (sealed.length < 1 + NONCE + TAG || sealed[0] !== FORMAT)
		throw new Error('Unsupported field ciphertext')
	const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(1, 1 + NONCE))
	decipher.setAAD(Buffer.from(aad, 'utf8'))
	decipher.setAuthTag(sealed.subarray(sealed.length - TAG))
	return Buffer.concat([
		decipher.update(sealed.subarray(1 + NONCE, sealed.length - TAG)),
		decipher.final(),
	])
}

/** Refuse every use when no key-encryption key is configured; callers fail as technical errors. */
export class UnavailableFieldCipher implements FieldCipher {
	/** Bind a cipher that refuses every operation. */
	bind(): BoundFieldCipher {
		/** Refuse without touching data. */
		const refuse = async (): Promise<never> => {
			throw new Error('Field encryption is not configured')
		}
		return { encrypt: refuse, decrypt: refuse }
	}
}

/**
 * Local development key hierarchy: a key-encryption key from the local API environment wraps one
 * random data key per tenant, stored in `hcm.tenant_field_key`. Production replaces the wrapping
 * with Cloud KMS behind the same port.
 */
export class LocalFieldCipher implements FieldCipher {
	private readonly keys = new Map<string, Buffer>()
	private readonly reference: string

	/** Hold the key-encryption key in memory only. */
	constructor(private readonly kek: Buffer) {
		if (kek.length !== 32) throw new Error('The local field key must be 32 bytes')
		this.reference = 'local:' + createHash('sha256').update(kek).digest('hex').slice(0, 16)
	}

	/** Bind to one tenant transaction. */
	bind(transaction: unknown, tenantId: string): BoundFieldCipher {
		const executor = transaction as Kysely<unknown>
		return {
			encrypt: /** Seal with the newest tenant key. */ async (target, plaintext) => {
				const { version, key } = await this.newest(executor, tenantId)
				return {
					keyVersion: version,
					ciphertext: seal(
						key,
						Buffer.from(plaintext, 'utf8'),
						this.aad(tenantId, target, version),
					),
				}
			},
			decrypt: /** Open with the recorded tenant key version. */ async (target, sealed) => {
				const key = await this.version(executor, tenantId, sealed.keyVersion)
				return open(key, sealed.ciphertext, this.aad(tenantId, target, sealed.keyVersion)).toString(
					'utf8',
				)
			},
		}
	}

	/** Associated data binding a value to its tenant, table, column, row and key version. */
	private aad(tenantId: string, target: CipherTarget, version: number): string {
		return JSON.stringify([tenantId, target.table, target.column, target.rowId, version])
	}

	/** The newest active tenant key, creating version 1 on first use. */
	private async newest(
		executor: Kysely<unknown>,
		tenantId: string,
	): Promise<{ version: number; key: Buffer }> {
		/** The newest active version, or null. */
		const newest = async () =>
			(
				await sql<{
					version: number
				}>`SELECT max(key_version)::int AS version FROM hcm.tenant_field_key WHERE tenant_id=${tenantId} AND retired_at IS NULL`.execute(
					executor,
				)
			).rows[0]?.version ?? null
		let version = await newest()
		if (version === null) {
			const key = randomBytes(32)
			await sql`INSERT INTO hcm.tenant_field_key(tenant_id,key_version,wrapped_key,kek_reference) VALUES (${tenantId},1,${seal(this.kek, key, `${tenantId}:1`)},${this.reference}) ON CONFLICT DO NOTHING`.execute(
				executor,
			)
			version = (await newest()) ?? 1
		}
		return { version, key: await this.version(executor, tenantId, version) }
	}

	/** Unwrap one tenant key version, cached in memory for the process. */
	private async version(
		executor: Kysely<unknown>,
		tenantId: string,
		version: number,
	): Promise<Buffer> {
		const cacheKey = `${tenantId}:${version}`
		const cached = this.keys.get(cacheKey)
		if (cached) return cached
		const row = (
			await sql<{
				wrapped: Buffer
				reference: string
			}>`SELECT wrapped_key AS wrapped,kek_reference AS reference FROM hcm.tenant_field_key WHERE tenant_id=${tenantId} AND key_version=${version}`.execute(
				executor,
			)
		).rows[0]
		if (!row) throw new Error('Tenant field key is missing')
		if (row.reference !== this.reference)
			throw new Error('Tenant field key was wrapped by another key')
		const key = open(this.kek, row.wrapped, cacheKey)
		this.keys.set(cacheKey, key)
		return key
	}
}

/** Choose the cipher for the environment: the local key only when running locally. */
export function createFieldCipher(env: Record<string, string | undefined>): FieldCipher {
	const encoded = env['HCM_LOCAL_FIELD_KEY']
	if (env['APP_ENVIRONMENT'] !== 'local' || !encoded) return new UnavailableFieldCipher()
	return new LocalFieldCipher(Buffer.from(encoded, 'base64'))
}
