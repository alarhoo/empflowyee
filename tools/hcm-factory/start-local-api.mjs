import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

if (
	process.env.K_SERVICE ||
	process.env.NODE_ENV === 'production' ||
	(process.env.APP_ENVIRONMENT && process.env.APP_ENVIRONMENT !== 'local')
)
	throw new Error('The local HCM launcher cannot run in a deployed environment')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
if (args.length > 1 || (args.length === 1 && args[0] !== '--no-watch'))
	throw new Error('Usage: start-local-api.mjs [--no-watch]')
let databaseUrl = process.env.HCM_DATABASE_URL
if (!databaseUrl) {
	try {
		const config = JSON.parse(readFileSync(path.join(root, '.local/hcm/database.json'), 'utf8'))
		if (config.port !== 55432 || !/^[0-9a-f]{64}$/.test(config.runtimePassword))
			throw new Error('Invalid local settings')
		databaseUrl = `postgresql://hcm_runtime:${config.runtimePassword}@127.0.0.1:${config.port}/hcm_db`
	} catch {
		throw new Error(
			'Persistent local HCM database configuration is missing. Run pnpm hcm:db:up before starting the API.',
		)
	}
}
// ADR-HCM-FIELD-ENCRYPTION: a local key-encryption key, generated once, private to this checkout
// and never committed. Losing it makes locally encrypted values unreadable.
const fieldKeyFile = path.join(root, '.local/hcm/field-key')
if (!process.env.HCM_LOCAL_FIELD_KEY && !existsSync(fieldKeyFile)) {
	mkdirSync(path.dirname(fieldKeyFile), { recursive: true })
	writeFileSync(fieldKeyFile, randomBytes(32).toString('base64'), { mode: 0o600 })
}
const fieldKey = process.env.HCM_LOCAL_FIELD_KEY ?? readFileSync(fieldKeyFile, 'utf8').trim()
const require = createRequire(import.meta.url)
const nxPackage = require('nx/package.json')
const nxCli = path.resolve(path.dirname(require.resolve('nx/package.json')), nxPackage.bin.nx)
const child = spawn(
	process.execPath,
	[nxCli, 'serve', 'hcm-api', ...(args.length ? ['--watch=false'] : [])],
	{
		cwd: root,
		stdio: 'inherit',
		env: {
			...process.env,
			APP_ENVIRONMENT: 'local',
			NODE_ENV: 'development',
			HCM_DATABASE_URL: databaseUrl,
			HCM_DOCUMENT_ROOT: process.env.HCM_DOCUMENT_ROOT ?? path.join(root, '.local/hcm/documents'),
			HCM_LOCAL_TENANTS: 'true',
			HCM_LOCAL_FIELD_KEY: fieldKey,
			HCM_LOCAL_WRITE_ORIGIN: process.env.HCM_LOCAL_WRITE_ORIGIN ?? 'http://acme.localhost:4302',
			HCM_LOCAL_SESSION: process.env.HCM_LOCAL_SESSION ?? 'true',
			PORT: process.env.PORT ?? '4402',
		},
	},
)
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
