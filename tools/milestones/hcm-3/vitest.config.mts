import { defineConfig, mergeConfig } from 'vitest/config'
import runtime from '../hcm-production-shell/vitest.config.mts'

// Pure HCM-3 contract/domain tests; SQL/RLS suites use the separate disposable PostgreSQL harness.
export default mergeConfig(
	runtime,
	defineConfig({
		test: {
			include: [
				'libs/hcm/web/attendance/**/schedule-form.spec.ts',
				'libs/hcm/web/attendance/**/shift-form.spec.ts',
				'libs/hcm/web/attendance/**/policy-form.spec.ts',
				'libs/hcm/web/attendance/**/override-form.spec.ts',
				'libs/hcm/web/attendance/**/holiday-form.spec.ts',
				'libs/hcm/api/audit/application/**/*.spec.ts',
				'libs/hcm/contracts/attendance/**/*.spec.ts',
				'libs/hcm/contracts/workflow/**/*.spec.ts',
				'libs/hcm/contracts/leave/**/*.spec.ts',
				'libs/hcm/api/leave/domain/**/*.spec.ts',
				'libs/hcm/api/leave/application/**/*.spec.ts',
				'libs/hcm/api/workflow/application/**/*.spec.ts',
				'libs/hcm/api/attendance/domain/**/*.spec.ts',
				'libs/hcm/api/attendance/application/**/*.spec.ts',
			],
		},
	}),
)
