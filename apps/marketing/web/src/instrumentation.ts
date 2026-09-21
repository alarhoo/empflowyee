import { parseNodeRuntimeConfig } from '@empflowyee/platform-runtime-contract'

/** Validate deployment metadata when the Next server starts, while allowing environment-independent builds. */
export function register() {
	if (
		process.env.NEXT_RUNTIME === 'nodejs' &&
		process.env.NEXT_PHASE !== 'phase-production-build'
	) {
		parseNodeRuntimeConfig(process.env, 4200)
	}
}
