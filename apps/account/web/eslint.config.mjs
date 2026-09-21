import nx from '@nx/eslint-plugin'
import baseConfig from '../../../eslint.config.mjs'

export default [
	...nx.configs['flat/angular'],
	...nx.configs['flat/angular-template'],
	...baseConfig,
	{
		files: ['**/*.ts'],
		rules: {
			'@angular-eslint/prefer-inject': 'warn',
			'@angular-eslint/prefer-standalone': 'error',
			'@angular-eslint/use-lifecycle-interface': 'error',
			'@angular-eslint/directive-selector': [
				'error',
				{
					type: 'attribute',
					prefix: 'efAccount',
					style: 'camelCase',
				},
			],
			'@angular-eslint/component-selector': [
				'error',
				{
					type: 'element',
					prefix: 'ef-account',
					style: 'kebab-case',
				},
			],
		},
	},
	{
		files: ['**/*.html'],
		// Override or add rules here
		rules: {},
	},
]
