import { defineConfig, mergeConfig } from 'vitest/config'
import runtime from '../hcm-production-shell/vitest.config.mts'

// Explicit browser acceptance requires a fresh hcm-web build and installed Playwright Chromium.
// It provisions only disposable PostgreSQL and loopback HTTP servers; no developer database reset.
export default mergeConfig(
	runtime,
	defineConfig({
		test: {
			include: [
				'libs/hcm/api/attendance/module/src/lib/templates-browser.spec.ts',
				'libs/hcm/api/attendance/module/src/lib/holidays-browser.spec.ts',
			],
			globalSetup: ['tools/hcm-database/test-postgres.mts'],
			fileParallelism: false,
			testTimeout: 120000,
			hookTimeout: 60000,
		},
	}),
)
