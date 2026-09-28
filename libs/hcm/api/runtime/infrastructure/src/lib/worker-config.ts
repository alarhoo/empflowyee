import {
	HCM_WORKLOADS,
	validateWorkerBudget,
	type HcmWorkerBudget,
	type HcmWorkload,
} from '@empflowyee/hcm-api-runtime-application'
import { assertLocalRuntime } from './hcm-api-runtime-infrastructure'

export interface HcmWorkerConfiguration extends HcmWorkerBudget {
	mode: 'drain' | 'poll'
	workloads: readonly HcmWorkload[]
	leaseMilliseconds: number
	maximumAttempts: number
	pollMilliseconds: number
	afterTenant: string
}

/** Parse finite numeric environment values without accepting blank strings, decimals, infinity or partially numeric input. */
function integer(
	env: Readonly<Record<string, string | undefined>>,
	key: string,
	fallback: number,
	min: number,
	max: number,
): number {
	const raw = env[key]
	if (raw !== undefined && !/^\d+$/.test(raw)) throw new Error(`Invalid worker setting: ${key}`)
	const value = raw === undefined ? fallback : Number(raw)
	if (!Number.isSafeInteger(value) || value < min || value > max)
		throw new Error(`Invalid worker setting: ${key}`)
	return value
}

/** Validate local runtime opt-in and all operational bounds before connecting or claiming; cloud activation is separately governed. */
export function readWorkerConfiguration(
	env: Readonly<Record<string, string | undefined>>,
): HcmWorkerConfiguration {
	assertLocalRuntime(env)
	if (env['HCM_LOCAL_TENANTS'] !== 'true' || !env['HCM_DATABASE_URL'])
		throw new Error('Worker requires explicit local database configuration')
	const mode = env['HCM_WORKER_MODE'] ?? 'drain'
	if (mode !== 'drain' && mode !== 'poll') throw new Error('Invalid HCM_WORKER_MODE')
	const workloads = (env['HCM_WORKER_WORKLOADS'] ?? '').split(',') as HcmWorkload[]
	if (
		!workloads.length ||
		new Set(workloads).size !== workloads.length ||
		workloads.some(
			/** Match exact approved workload identifiers and reject whitespace or unknown registrations. */ (
				value,
			) => !HCM_WORKLOADS.includes(value),
		)
	)
		throw new Error('Explicit registered HCM_WORKER_WORKLOADS are required')
	const afterTenant = env['HCM_WORKER_AFTER_TENANT'] ?? ''
	if (afterTenant.length > 200 || /\p{Cc}/u.test(afterTenant))
		throw new Error('Invalid worker continuation')
	const result: HcmWorkerConfiguration = {
		mode,
		workloads: Object.freeze(workloads),
		afterTenant,
		maximumItems: integer(env, 'HCM_WORKER_MAX_ITEMS', 100, 1, 10000),
		maximumTenants: integer(env, 'HCM_WORKER_MAX_TENANTS', 100, 1, 10000),
		itemsPerTenant: integer(env, 'HCM_WORKER_ITEMS_PER_TENANT', 10, 1, 1000),
		maximumMilliseconds: integer(env, 'HCM_WORKER_MAX_MS', 30000, 100, 1800000),
		retryBaseMilliseconds: integer(env, 'HCM_WORKER_RETRY_BASE_MS', 1000, 1, 3600000),
		retryMaximumMilliseconds: integer(env, 'HCM_WORKER_RETRY_MAX_MS', 300000, 1, 86400000),
		leaseMilliseconds: integer(env, 'HCM_WORKER_LEASE_MS', 60000, 1000, 300000),
		maximumAttempts: integer(env, 'HCM_WORKER_MAX_ATTEMPTS', 5, 1, 100),
		pollMilliseconds: integer(env, 'HCM_WORKER_POLL_MS', 5000, 100, 60000),
	}
	validateWorkerBudget(result)
	return Object.freeze(result)
}
