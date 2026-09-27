import { defineConfig } from 'vitest/config'

/** Exercise pure D3 layout invariants; native interactions are covered by live browser tests. */
export default defineConfig({
	root: import.meta.dirname,
	test: {
		name: 'hcm-web-ux-hierarchy-chart',
		environment: 'node',
		include: ['src/**/*.spec.ts'],
	},
})
