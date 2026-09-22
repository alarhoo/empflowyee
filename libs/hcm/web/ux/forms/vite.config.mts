/// <reference types='vitest' />
import { defineConfig } from 'vite'
import angular from '@analogjs/vite-plugin-angular'
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin'
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin'

export default defineConfig(
	/** Configure isolated tests for this generated UX library. */ () => ({
		root: import.meta.dirname,
		cacheDir: '../../../../../node_modules/.vite/libs/hcm/web/ux/forms',
		plugins: [angular(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
		test: {
			name: 'hcm-web-ux-forms',
			watch: false,
			globals: true,
			environment: 'jsdom',
			include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
			setupFiles: ['src/test-setup.ts'],
			reporters: ['default'],
			coverage: {
				reportsDirectory: '../../../../../coverage/libs/hcm/web/ux/forms',
				provider: 'v8' as const,
			},
		},
	}),
)
