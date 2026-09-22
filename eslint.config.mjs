import nx from '@nx/eslint-plugin'
import stylistic from '@stylistic/eslint-plugin'
import jsdoc from 'eslint-plugin-jsdoc'

// Stylistic maintains the former ESLint formatting rules and supports TypeScript.
export const sharedRules = {
	'jsdoc/require-jsdoc': [
		'error',
		{
			enableFixer: false,
			checkAllFunctionExpressions: true,
			checkConstructors: true,
			checkGetters: true,
			checkSetters: true,
			exemptEmptyConstructors: false,
			exemptEmptyFunctions: false,
			// A selector covers inline callbacks and returned arrows, which the default skips.
			contexts: ['ArrowFunctionExpression[body]'],
			require: {
				FunctionDeclaration: true,
				FunctionExpression: true,
				ArrowFunctionExpression: false,
				MethodDefinition: true,
			},
		},
	],
	'jsdoc/require-description': ['error', { exemptedBy: [] }],
	'@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
	'consistent-this': 'error',
	'no-div-regex': 'error',
	'@stylistic/no-floating-decimal': 'error',
	'no-self-compare': 'error',
	'@stylistic/no-mixed-spaces-and-tabs': ['error', 'smart-tabs'],
	'no-nested-ternary': 'error',
	radix: 'error',
	'@stylistic/keyword-spacing': 'error',
	'@stylistic/space-unary-ops': 'error',
	'@stylistic/wrap-iife': ['error', 'any'],
	camelcase: 'warn',
	'consistent-return': 'warn',
	'max-nested-callbacks': ['warn', 3],
	'no-extra-boolean-cast': 'warn',
	'no-lonely-if': 'warn',
	'no-new': 'warn',
	'no-new-wrappers': 'warn',
	'no-redeclare': 'warn',
	'no-unused-expressions': 'warn',
	'no-use-before-define': ['warn', { functions: false, classes: true, variables: true }],
	'no-warning-comments': 'warn',
	strict: 'warn',
	'default-case': 'warn',
	'dot-notation': 'off',
	'@stylistic/eol-last': 'off',
	eqeqeq: 'off',
	'no-underscore-dangle': 'off',
	'@stylistic/key-spacing': 'off',
	'@stylistic/no-multi-spaces': 'off',
	'no-shadow': 'off',
	'no-irregular-whitespace': 'error',
	'no-var': 'error',
	'no-const-assign': 'error',
	'prefer-const': 'error',
	'@stylistic/object-curly-spacing': ['error', 'always'],
	'@stylistic/comma-spacing': ['error', { before: false, after: true }],
	'@stylistic/no-trailing-spaces': 'warn',
	'@stylistic/space-before-function-paren': [
		'warn',
		{ named: 'never', anonymous: 'never', asyncArrow: 'always', catch: 'always' },
	],
	'@stylistic/block-spacing': ['error', 'always'],
	'@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
	'@stylistic/indent': ['error', 'tab', { SwitchCase: 1 }],
	'@stylistic/semi': ['error', 'never'],
}

const productRestrictions = [
	{
		files: ['apps/hcm/web/**/*.ts', 'libs/hcm/web/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['primeng', 'primeng/*', '@primeuix/*'],
							message: 'PrimeNG belongs to Console, not HCM.',
						},
						{ group: ['@spartan-ng/*'], message: 'Spartan belongs to Account, not HCM.' },
						{
							group: ['@nestjs/*', 'next', 'react', 'react/*'],
							message: 'HCM browser code must not import server/Next/React runtime packages.',
						},
					],
				},
			],
		},
	},
	{
		files: ['apps/account/web/**/*.ts', 'libs/account/web/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['primeng', 'primeng/*', '@primeuix/*'],
							message: 'PrimeNG belongs to Console, not Account.',
						},
						{
							group: ['@fundamental-ngx/*', '@ui5/*'],
							message: 'Fundamental/UI5 belongs to HCM, not Account.',
						},
						{
							group: ['@nestjs/*', 'next', 'react', 'react/*'],
							message: 'Account browser code must not import server/Next/React runtime packages.',
						},
					],
				},
			],
		},
	},
	{
		files: ['apps/console/web/**/*.ts', 'libs/console/web/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{ group: ['@spartan-ng/*'], message: 'Spartan belongs to Account, not Console.' },
						{
							group: ['@fundamental-ngx/*', '@ui5/*'],
							message: 'Fundamental/UI5 belongs to HCM, not Console.',
						},
						{
							group: ['@nestjs/*', 'next', 'react', 'react/*'],
							message: 'Console browser code must not import server/Next/React runtime packages.',
						},
					],
				},
			],
		},
	},
	{
		files: ['apps/marketing/web/**/*.{ts,tsx,js,jsx}', 'libs/marketing/web/**/*.{ts,tsx,js,jsx}'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: [
								'@angular/*',
								'@nestjs/*',
								'primeng',
								'primeng/*',
								'@primeuix/*',
								'@spartan-ng/*',
								'@fundamental-ngx/*',
								'@ui5/*',
							],
							message: 'Marketing is an independent Next.js product surface.',
						},
					],
				},
			],
		},
	},
	{
		files: ['apps/**/api/**/*.ts', 'libs/**/api/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: [
								'@angular/*',
								'primeng',
								'primeng/*',
								'@primeuix/*',
								'@spartan-ng/*',
								'@fundamental-ngx/*',
								'@ui5/*',
								'next',
								'react',
								'react/*',
							],
							message: 'API projects must not import browser/UI frameworks.',
						},
					],
				},
			],
		},
	},
]

export default [
	...nx.configs['flat/base'],
	...nx.configs['flat/typescript'],
	...nx.configs['flat/javascript'],
	{
		ignores: [
			'**/dist/**',
			'**/coverage/**',
			'**/.next/**',
			'**/.nx/**',
			'**/.angular/**',
			'**/next-env.d.ts',
			'**/vitest.config.*.timestamp*',
		],
	},
	{
		files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
		plugins: { '@stylistic': stylistic, jsdoc },
		settings: {
			jsdoc: {
				ignoreReplacesDocs: false,
				overrideReplacesDocs: false,
				augmentsExtendsReplacesDocs: false,
				implementsReplacesDocs: false,
			},
		},
		rules: sharedRules,
	},
	{
		files: ['**/*.{ts,tsx,mts,cts}'],
		rules: {
			// Use TS-aware rules for overloads, declaration merging and parameter properties.
			'no-redeclare': 'off',
			'@typescript-eslint/no-redeclare': 'warn',
			'no-unused-expressions': 'off',
			'@typescript-eslint/no-unused-expressions': 'warn',
			'no-use-before-define': 'off',
			'@typescript-eslint/no-use-before-define': [
				'warn',
				{ functions: false, classes: true, variables: true },
			],
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{ argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
			],
			'@typescript-eslint/no-shadow': 'off',
		},
	},
	{
		basePath: import.meta.dirname,
		files: [
			'apps/{account,hcm,console}/{web,api}/src/**/*.ts',
			'libs/{account,hcm,console}/{web,api}/**/*.ts',
		],
		languageOptions: {
			parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
		},
		rules: {
			'consistent-return': 'off',
			'@typescript-eslint/consistent-return': 'warn',
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-misused-promises': 'error',
			'@typescript-eslint/prefer-readonly': 'warn',
			// Preserve value imports used by Angular/Nest runtime decorator metadata.
			'@typescript-eslint/consistent-type-imports': 'off',
		},
	},
	{
		files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
		rules: {
			'@nx/enforce-module-boundaries': [
				'error',
				{
					enforceBuildableLibDependency: true,
					allow: [],
					depConstraints: [
						{
							sourceTag: 'product:hcm',
							onlyDependOnLibsWithTags: ['product:hcm', 'product:platform'],
						},
						{
							sourceTag: 'product:account',
							onlyDependOnLibsWithTags: ['product:account', 'product:platform'],
						},
						{
							sourceTag: 'product:console',
							onlyDependOnLibsWithTags: ['product:console', 'product:platform'],
						},
						{
							sourceTag: 'product:marketing',
							onlyDependOnLibsWithTags: ['product:marketing', 'product:platform'],
						},
						{ sourceTag: 'product:platform', onlyDependOnLibsWithTags: ['product:platform'] },

						{
							sourceTag: 'runtime:web',
							onlyDependOnLibsWithTags: ['runtime:web', 'runtime:universal'],
						},
						{
							sourceTag: 'runtime:api',
							onlyDependOnLibsWithTags: ['runtime:api', 'runtime:universal'],
						},
						{ sourceTag: 'runtime:universal', onlyDependOnLibsWithTags: ['runtime:universal'] },

						{
							sourceTag: 'type:app',
							onlyDependOnLibsWithTags: [
								'type:shell',
								'type:feature',
								'type:data-access',
								'type:ui',
								'type:floorplan',
								'type:util',
								'type:contract',
								'type:domain',
								'type:application',
								'type:infrastructure',
								'type:transport',
								'type:module',
							],
						},
						{
							sourceTag: 'type:shell',
							onlyDependOnLibsWithTags: [
								'type:feature',
								'type:data-access',
								'type:ui',
								'type:util',
								'type:contract',
								'type:floorplan',
							],
						},
						{
							sourceTag: 'type:feature',
							onlyDependOnLibsWithTags: [
								'type:data-access',
								'type:ui',
								'type:util',
								'type:contract',
								'type:floorplan',
							],
						},
						{
							sourceTag: 'type:data-access',
							onlyDependOnLibsWithTags: ['type:util', 'type:contract'],
						},
						{
							sourceTag: 'type:ui',
							onlyDependOnLibsWithTags: ['type:ui', 'type:util', 'type:contract'],
						},
						{
							sourceTag: 'type:floorplan',
							onlyDependOnLibsWithTags: ['type:ui', 'type:util', 'type:contract'],
						},
						{
							allSourceTags: ['product:hcm', 'type:floorplan'],
							onlyDependOnLibsWithTags: ['domain:ux'],
						},
						{ sourceTag: 'type:util', onlyDependOnLibsWithTags: ['type:util', 'type:contract'] },
						{ sourceTag: 'type:contract', onlyDependOnLibsWithTags: ['type:contract'] },

						{
							sourceTag: 'type:domain',
							onlyDependOnLibsWithTags: ['type:domain', 'type:contract'],
						},
						{
							sourceTag: 'type:application',
							onlyDependOnLibsWithTags: ['type:application', 'type:domain', 'type:contract'],
						},
						{
							sourceTag: 'type:infrastructure',
							onlyDependOnLibsWithTags: [
								'type:infrastructure',
								'type:application',
								'type:domain',
								'type:contract',
								'type:util',
							],
						},
						{
							sourceTag: 'type:transport',
							onlyDependOnLibsWithTags: [
								'type:transport',
								'type:application',
								'type:contract',
								'type:util',
							],
						},
						{
							sourceTag: 'type:module',
							onlyDependOnLibsWithTags: [
								'type:module',
								'type:transport',
								'type:infrastructure',
								'type:application',
								'type:domain',
								'type:contract',
								'type:util',
							],
						},
					],
				},
			],
		},
	},
	// Imported configs are otherwise matched relative to each application's config.
	...productRestrictions.map(
		/** Anchor product import restrictions to the repository root when app configs import this shared configuration. */ (
			config,
		) => ({ ...config, basePath: import.meta.dirname }),
	),
	{
		files: ['**/eslint.config.{js,mjs,cjs}'],
		// Tooling configs deliberately compose the root config outside any Nx project.
		rules: { '@nx/enforce-module-boundaries': 'off' },
	},
]
