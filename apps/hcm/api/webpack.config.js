const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin')
const { join } = require('path')

module.exports = {
	output: {
		path: join(__dirname, '../../../dist/apps/hcm/api'),
		clean: true,
		...(process.env.NODE_ENV !== 'production' && {
			devtoolModuleFilenameTemplate: '[absolute-resource-path]',
		}),
	},
	plugins: [
		new NxAppWebpackPlugin({
			target: 'node',
			compiler: 'tsc',
			main: './src/main.ts',
			tsConfig: './tsconfig.app.json',
			assets: ['./src/assets'],
			optimization: false,
			outputHashing: 'none',
			// Dedicated prune targets own deployment dependency metadata.
			generatePackageJson: false,
			sourceMap: true,
		}),
	],
}
