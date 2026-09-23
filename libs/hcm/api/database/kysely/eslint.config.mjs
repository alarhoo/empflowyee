import baseConfig from '../../../../../eslint.config.mjs'

export default [
	...baseConfig,
	{
		files: ['**/*.ts'],
		// PostgreSQL column and pg option names are external contracts, not JavaScript identifiers we own.
		rules: {
			camelcase: ['warn', { allow: ['^tenant_id$', '^statement_timeout$', '^application_name$'] }],
		},
	},
]
