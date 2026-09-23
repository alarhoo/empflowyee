import baseConfig from '../../../../../eslint.config.mjs'

export default [
	...baseConfig,
	{
		files: ['**/*.ts'],
		// Preserve the pg driver's external configuration option spelling.
		rules: { camelcase: ['warn', { allow: ['^application_name$'] }] },
	},
]
