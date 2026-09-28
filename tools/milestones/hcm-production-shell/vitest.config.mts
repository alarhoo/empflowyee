import { defineConfig } from 'vitest/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const paths = JSON.parse(readFileSync('tsconfig.base.json', 'utf8')).compilerOptions
	.paths as Record<string, string[]>

export default defineConfig({
	resolve: {
		alias: Object.fromEntries(
			Object.entries(paths)
				.sort(
					/** Match explicit secondary entry points before their parent library aliases. */ (
						[left],
						[right],
					) => right.length - left.length,
				)
				.map(
					/** Reuse the exact workspace aliases for isolated Node integration tests. */ ([
						name,
						targets,
					]) => [name, resolve(targets[0])],
				),
		),
	},
	plugins: [
		{
			name: 'nest-test-decorators',
			enforce: 'pre',
			/** Preserve Nest's legacy parameter decorators when compiling API source in the Node test runner. */
			transform(code, id) {
				if (!id.replaceAll('\\', '/').includes('/libs/hcm/api/') || !id.endsWith('.ts')) return null
				return {
					code: ts.transpileModule(code, {
						compilerOptions: {
							target: ts.ScriptTarget.ES2022,
							module: ts.ModuleKind.ESNext,
							experimentalDecorators: true,
							emitDecoratorMetadata: true,
						},
					}).outputText,
					map: null,
				}
			},
		},
	],
	test: {
		environment: 'node',
		include: [
			'libs/hcm/api/runtime/application/src/lib/worker.spec.ts',
			'libs/hcm/api/runtime/infrastructure/src/lib/worker-config.spec.ts',
			'libs/hcm/api/runtime/module/src/lib/hcm-api-runtime-module.spec.ts',
			'libs/hcm/contracts/runtime/**/*.spec.ts',
			'libs/hcm/contracts/employee/**/*.spec.ts',
		],
		testTimeout: 15000,
	},
})
