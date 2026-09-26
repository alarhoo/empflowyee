import { defineConfig, mergeConfig } from 'vitest/config'
import runtime from '../milestones/hcm-production-shell/vitest.config.mts'

export default mergeConfig(
	runtime,
	defineConfig({
		test: {
			include: [
				'libs/hcm/api/database/**/*.spec.ts',
				'libs/hcm/api/runtime/**/*.database.spec.ts',
				'libs/hcm/api/access-control/**/*.spec.ts',
				'libs/hcm/api/audit/**/*.spec.ts',
				'libs/hcm/api/identity-access/**/*.spec.ts',
				'libs/hcm/api/notifications/**/*.spec.ts',
				'libs/hcm/api/documents/**/*.spec.ts',
				'libs/hcm/api/workforce-foundation/**/*.spec.ts',
				'libs/hcm/api/job-architecture/**/*.spec.ts',
				'libs/hcm/api/employee/**/*.spec.ts',
			],
			globalSetup: ['tools/hcm-database/test-postgres.mts'],
			fileParallelism: false,
			testTimeout: 30000,
			hookTimeout: 30000,
		},
	}),
)
