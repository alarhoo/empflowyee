import { it, expect } from 'vitest'
import { readWorkerConfiguration } from './worker-config'

const env = {
	APP_ENVIRONMENT: 'local',
	NODE_ENV: 'test',
	HCM_LOCAL_TENANTS: 'true',
	HCM_DATABASE_URL: 'postgresql://configured-by-test',
	HCM_WORKER_WORKLOADS: 'LeaveAccrual,AttendanceCalculate',
}

it('requires exact workload selection and finite operational limits', /** Defaults coordinate local execution without claiming production SLOs. */ () => {
	expect(readWorkerConfiguration(env)).toMatchObject({
		mode: 'drain',
		maximumItems: 100,
		itemsPerTenant: 10,
		workloads: ['LeaveAccrual', 'AttendanceCalculate'],
	})
	for (const change of [
		{ HCM_WORKER_WORKLOADS: '' },
		{ HCM_WORKER_WORKLOADS: 'LeaveAccrual, LeaveExpiry' },
		{ HCM_WORKER_WORKLOADS: 'LeaveAccrual,LeaveAccrual' },
		{ HCM_WORKER_MAX_ITEMS: '1.5' },
		{ HCM_WORKER_MODE: 'server' },
		{ HCM_WORKER_RETRY_BASE_MS: '999999', HCM_WORKER_RETRY_MAX_MS: '1' },
	])
		expect(
			/** Validate each malformed environment independently. */ () =>
				readWorkerConfiguration({ ...env, ...change }),
		).toThrow()
})

it('refuses cloud markers or absent local opt-in before touching a database', /** A future cloud activation requires the separate approved runtime/IAM integration. */ () => {
	for (const change of [
		{ APP_ENVIRONMENT: 'production' },
		{ K_JOB: 'job' },
		{ HCM_LOCAL_TENANTS: 'false' },
		{ HCM_DATABASE_URL: '' },
	])
		expect(
			/** Check that local flags cannot override a deployed runtime. */ () =>
				readWorkerConfiguration({ ...env, ...change }),
		).toThrow()
})
