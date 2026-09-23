import baseConfig from '../../../../../eslint.config.mjs'

export default [
	...baseConfig,
	{
		files: ['**/*.ts'],
		// Preserve the pg driver's documented external option spelling.
		rules: { camelcase: ['warn', { allow: ['^application_name$'] }] },
	},
]
