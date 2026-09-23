import baseConfig from '../../../../../eslint.config.mjs'

export default [
	...baseConfig,
	{
		files: ['**/*.ts'],
		// Preserve PostgreSQL/pg external names at this server-only read boundary.
		rules: { camelcase: ['warn', { allow: ['^statement_timeout$', '^application_name$'] }] },
	},
]
