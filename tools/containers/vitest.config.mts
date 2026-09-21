import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
	resolve: {
		alias: {
			'@empflowyee/platform-runtime-contract': resolve(
				'libs/platform/contracts/runtime/src/index.ts',
			),
		},
	},
	test: { include: ['libs/platform/**/src/**/*.spec.ts'] },
})
