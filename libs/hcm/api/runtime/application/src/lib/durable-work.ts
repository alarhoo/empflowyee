import type { HcmWorkload } from './workload-context'

export type WorkValue =
	null | boolean | number | string | WorkValue[] | { [key: string]: WorkValue }

export interface HcmWorkIntent {
	workload: HcmWorkload
	kind: string
	schemaVersion: number
	businessKey: string
	payload: { [key: string]: WorkValue }
	availableAt?: string
}

export interface ClaimedHcmWork {
	id: string
	workload: HcmWorkload
	kind: string
	schemaVersion: number
	businessKey: string
	payload: { [key: string]: WorkValue }
	digest: string
	attempt: number
	fence: number
}

export interface HcmWorkLeaseOptions {
	leaseMilliseconds: number
	maximumAttempts: number
}

export class HcmWorkError extends Error {
	/** Preserve safe coordination failures without carrying raw payloads or provider diagnostics. */
	constructor(readonly code: 'invalid-work' | 'work-conflict' | 'lease-lost') {
		super(code)
	}
}
