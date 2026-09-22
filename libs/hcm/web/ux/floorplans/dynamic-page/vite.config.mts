/// <reference types='vitest' />
import { defineConfig } from 'vite'
import angular from '@analogjs/vite-plugin-angular'
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin'
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin'

export default defineConfig(
	/** Configure isolated tests for the production dynamic-page contract. */ () => ({
		root: import.meta.dirname,
		cacheDir: '../../../../../../node_modules/.vite/libs/hcm/web/ux/floorplans/dynamic-page',
		plugins: [angular(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
		test: {
			name: 'hcm-web-ux-floorplan-dynamic-page',
			watch: false,
			globals: true,
			environment: 'jsdom',
			include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
			setupFiles: ['src/test-setup.ts'],
			reporters: ['default'],
			coverage: {
				reportsDirectory: '../../../../../../coverage/libs/hcm/web/ux/floorplans/dynamic-page',
				provider: 'v8' as const,
			},
		},
	}),
)
