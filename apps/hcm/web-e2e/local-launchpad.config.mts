import { defineConfig, devices } from '@playwright/test'

// Exercises the real local API adapter. Start dev:hcm and dev:hcm-api before running.
export default defineConfig({
	testDir: './live',
	outputDir: '../../../.tmp/hcm-launchpad-browser',
	workers: 1,
	timeout: 90000,
	use: {
		baseURL: 'http://acme.localhost:4302',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
