/**
 * Field-level encryption port (ADR-HCM-FIELD-ENCRYPTION). Domains encrypt before writing and
 * decrypt only inside an authorized use case; Kysely rows carry ciphertext and key version only.
 */

/** Where an encrypted value lives; it is bound into the ciphertext as associated data. */
export interface CipherTarget {
	table: string
	column: string
	rowId: string
}

/** Ciphertext and the tenant data key version that sealed it. */
export interface SealedValue {
	ciphertext: Buffer
	keyVersion: number
}

/** A cipher bound to one tenant transaction. */
export interface BoundFieldCipher {
	/** Seal a value for exactly this tenant, table, column and row with the newest key. */
	encrypt(target: CipherTarget, plaintext: string): Promise<SealedValue>
	/** Open a value; a value copied to another row, column or tenant fails authentication. */
	decrypt(target: CipherTarget, sealed: SealedValue): Promise<string>
}

export abstract class FieldCipher {
	/** Bind to a caller's open tenant transaction; the handle is opaque to application code. */
	abstract bind(transaction: unknown, tenantId: string): BoundFieldCipher
}
