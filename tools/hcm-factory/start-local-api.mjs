import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

if (
	process.env.K_SERVICE ||
	process.env.NODE_ENV === 'production' ||
	(process.env.APP_ENVIRONMENT && process.env.APP_ENVIRONMENT !== 'local')
)
	throw new Error('The local HCM launcher cannot run in a deployed environment')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(import.meta.url)
const nxPackage = require('nx/package.json')
const nxCli = path.resolve(path.dirname(require.resolve('nx/package.json')), nxPackage.bin.nx)
const child = spawn(process.execPath, [nxCli, 'serve', 'hcm-api'], {
	cwd: root,
	stdio: 'inherit',
	env: {
		...process.env,
		APP_ENVIRONMENT: 'local',
		HCM_LOCAL_TENANTS: 'true',
		HCM_LOCAL_SESSION: process.env.HCM_LOCAL_SESSION ?? 'true',
		PORT: process.env.PORT ?? '4402',
	},
})
child.on(
	'exit',
	/** Preserve the development server's exit code for shell tooling. */ (code) => {
		process.exitCode = code ?? 1
	},
)
child.on(
	'error',
	/** Surface process startup failures instead of claiming the local API is available. */ (
		error,
	) => {
		console.error(error.message)
		process.exitCode = 1
	},
)
