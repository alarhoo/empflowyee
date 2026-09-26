import { createHash } from 'node:crypto'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'

export interface CommandReceipt {
	requestHash: string
	response: unknown
}

/** Actor- and operation-bound receipt storage owned by one business domain. */
export interface CommandReceiptStore {
	/** Read the committed receipt for this tenant, actor, operation and key. */
	get(operation: string, key: string): Promise<CommandReceipt | null>
	/** Store a safe response in the same transaction as the business change. */
	save(operation: string, key: string, receipt: CommandReceipt): Promise<void>
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Require a client-generated UUID idempotency key. */
export function requireIdempotencyKey(key: string): string {
	if (typeof key !== 'string' || !uuid.test(key))
		throw new HcmDomainError('invalid-request', [{ field: 'Idempotency-Key', code: 'invalid' }])
	return key
}

/** Hash the exact route target and canonical parsed payload of a command. */
export function commandHash(target: string, payload: unknown): string {
	return createHash('sha256')
		.update(JSON.stringify([target, payload]))
		.digest('hex')
}

/**
 * Replay the first committed response for an identical request, reject key reuse with another
 * payload, and otherwise run the command and store its receipt in the same transaction.
 */
export async function runIdempotent<T>(
	store: CommandReceiptStore,
	operation: string,
	key: string,
	requestHash: string,
	work: () => Promise<T>,
): Promise<T> {
	const prior = await store.get(operation, requireIdempotencyKey(key))
	if (prior) {
		if (prior.requestHash !== requestHash) throw new HcmDomainError('idempotency-conflict')
		return prior.response as T
	}
	const response = await work()
	await store.save(operation, key, { requestHash, response })
	return response
}
