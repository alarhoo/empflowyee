import { defineConfig, mergeConfig } from 'vitest/config'
import runtime from '../hcm-production-shell/vitest.config.mts'

// Pure HCM-3 contract/domain tests; SQL/RLS suites use the separate disposable PostgreSQL harness.
export default mergeConfig(
	runtime,
	defineConfig({
		test: {
			include: [
				'libs/hcm/api/audit/application/**/*.spec.ts',
				'libs/hcm/contracts/attendance/**/*.spec.ts',
				'libs/hcm/api/attendance/domain/**/*.spec.ts',
			],
		},
	}),
)
