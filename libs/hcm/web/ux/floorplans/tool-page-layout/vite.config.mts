/// <reference types='vitest' />
import { defineConfig } from 'vite'
import angular from '@analogjs/vite-plugin-angular'
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin'
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin'

export default defineConfig(
	/** Configure isolated Angular tests for the native layout integration. */ () => ({
		root: import.meta.dirname,
		cacheDir: '../../../../../../node_modules/.vite/libs/hcm/web/ux/floorplans/tool-page-layout',
		plugins: [angular(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
		// Uncomment this if you are using workers.
		// worker: {
		//   plugins: () => [ nxViteTsPaths() ],
		// },
		test: {
			name: 'hcm-web-ux-floorplan-tool-page-layout',
			watch: false,
			globals: true,
			environment: 'jsdom',
			include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
			setupFiles: ['src/test-setup.ts'],
			reporters: ['default'],
			coverage: {
				reportsDirectory: '../../../../../../coverage/libs/hcm/web/ux/floorplans/tool-page-layout',
				provider: 'v8' as const,
			},
		},
	}),
)
