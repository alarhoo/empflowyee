// Test-only entry point for the existing disposable PostgreSQL/Nest HTTP harness.
// Production composition imports src/index.ts and does not load test dependencies.
export {
	startHcmTestApi,
	HCM_TEST_TENANT,
	HCM_TEST_ORIGIN,
	type HcmTestApi,
	type HcmReply,
} from './lib/attendance-test-harness'
