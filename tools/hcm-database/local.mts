import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { Client } from 'pg'
import {
	migrateHcmDatabase,
	loadSqlMigrations,
} from '../../libs/hcm/api/database/migrations/src/lib/hcm-api-database-migrations.ts'
import { runDevelopmentSeeds } from '../../libs/hcm/api/database/seed/src/lib/hcm-api-database-seed.ts'
import { seedConnection } from '../../libs/hcm/api/database/seed/src/lib/seed-target.ts'

const container = 'empflowyee-hcm-postgres'
const volume = 'empflowyee-hcm-postgres-data'
const owner = 'hcm-local-foundation'
const image =
	'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24'
const configPath = resolve('.local/hcm/database.json')

interface LocalDatabaseConfig {
	adminPassword: string
	migratorPassword: string
	runtimePassword: string
	port: number
}

/** Run only explicit Docker operations, suppressing arguments and diagnostics that may contain credentials. */
function docker(args: string[]): string {
	try {
		return execFileSync('docker', args, {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true,
			timeout: 120000,
		}).trim()
	} catch {
		throw new Error(
			'Local PostgreSQL operation failed; inspect Docker availability and the named local container',
		)
	}
}

/** Restrict generated credential files to the invoking OS user rather than relying on repository ignore rules alone. */
async function protectCredentials(): Promise<void> {
	if (process.platform === 'win32') {
		const user = execFileSync('whoami', [], { encoding: 'utf8', windowsHide: true }).trim()
		execFileSync('icacls', [configPath, '/inheritance:r', '/grant:r', `${user}:F`], {
			stdio: 'ignore',
			windowsHide: true,
		})
	} else await chmod(configPath, 0o600)
}

/** Provision a persistent, loopback-only local database and explicitly migrate/seed it without altering other containers. */
async function main(): Promise<void> {
	// Reuse all environment/cloud gates before creating resources; this URI validates syntax only.
	seedConnection({
		...process.env,
		APP_ENVIRONMENT: process.env['APP_ENVIRONMENT'] ?? 'local',
		NODE_ENV: process.env['NODE_ENV'] ?? 'development',
		HCM_SEED_TARGET: 'local-dunder-mifflin',
		HCM_SEED_DATABASE_URL: 'postgresql://hcm_migrator:validation-only@127.0.0.1:55432/hcm_db',
	})
	let config: LocalDatabaseConfig
	try {
		config = JSON.parse(await readFile(configPath, 'utf8')) as LocalDatabaseConfig
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
		if (
			docker(['ps', '-a', '--filter', `name=^/${container}$`, '--format', '{{.Names}}']) ||
			docker(['volume', 'ls', '--filter', `name=^${volume}$`, '--format', '{{.Name}}'])
		)
			throw new Error(
				'Persistent local resources exist without their credentials; restore the credential file rather than replacing data',
			)
		config = {
			adminPassword: randomBytes(32).toString('hex'),
			migratorPassword: randomBytes(32).toString('hex'),
			runtimePassword: randomBytes(32).toString('hex'),
			port: 55432,
		}
		await mkdir(resolve('.local/hcm'), { recursive: true })
		await writeFile(configPath, JSON.stringify(config), { mode: 0o600, flag: 'wx' })
	}
	await protectCredentials()
	if (
		config.port !== 55432 ||
		![config.adminPassword, config.migratorPassword, config.runtimePassword].every(
			/** Reject malformed local settings before passing them into Docker or PostgreSQL. */ (
				value,
			) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value),
		)
	)
		throw new Error('Invalid local database credential file')
	const existing = docker([
		'ps',
		'-a',
		'--filter',
		`name=^/${container}$`,
		'--format',
		'{{.Names}}',
	])
	if (existing) {
		const inspected = JSON.parse(docker(['inspect', container]))[0]
		if (
			inspected.Config.Labels?.['com.empflowyee.owner'] !== owner ||
			!inspected.Mounts.some(
				/** Verify the persistent volume belongs to the expected local container. */ (mount: {
					Name?: string
					Destination: string
				}) => mount.Name === volume && mount.Destination === '/var/lib/postgresql/data',
			) ||
			inspected.HostConfig.PortBindings?.['5432/tcp']?.[0]?.HostIp !== '127.0.0.1' ||
			inspected.HostConfig.PortBindings?.['5432/tcp']?.[0]?.HostPort !== String(config.port)
		)
			throw new Error('Refusing to adopt an unexpected local PostgreSQL container')
		docker(['start', container])
	} else {
		const existingVolume = docker([
			'volume',
			'ls',
			'--filter',
			`name=^${volume}$`,
			'--format',
			'{{.Name}}',
		])
		if (existingVolume) {
			const inspected = JSON.parse(docker(['volume', 'inspect', volume]))[0]
			if (inspected.Labels?.['com.empflowyee.owner'] !== owner)
				throw new Error('Refusing to adopt an unowned PostgreSQL volume')
		} else docker(['volume', 'create', '--label', `com.empflowyee.owner=${owner}`, volume])
		docker([
			'run',
			'--detach',
			'--name',
			container,
			'--label',
			`com.empflowyee.owner=${owner}`,
			'--restart',
			'unless-stopped',
			'--publish',
			`127.0.0.1:${config.port}:5432`,
			'--mount',
			`type=volume,source=${volume},target=/var/lib/postgresql/data`,
			'--env',
			`POSTGRES_PASSWORD=${config.adminPassword}`,
			image,
		])
	}
	let ready = false
	for (let attempt = 0; attempt < 60; attempt++) {
		try {
			docker(['exec', container, 'pg_isready', '-U', 'postgres', '-h', '127.0.0.1'])
			ready = true
			break
		} catch {
			await setTimeout(500)
		}
	}
	if (!ready) throw new Error('Local PostgreSQL did not become ready')
	const databaseExists = docker([
		'exec',
		container,
		'psql',
		'-U',
		'postgres',
		'-d',
		'postgres',
		'-tAc',
		"SELECT 1 FROM pg_database WHERE datname='hcm_db'",
	])
	if (!databaseExists) {
		docker(['cp', resolve('tools/hcm-database/bootstrap.sql'), `${container}:/tmp/bootstrap.sql`])
		docker([
			'exec',
			'--env',
			`HCM_MIGRATOR_PASSWORD=${config.migratorPassword}`,
			'--env',
			`HCM_RUNTIME_PASSWORD=${config.runtimePassword}`,
			container,
			'psql',
			'-U',
			'postgres',
			'-d',
			'postgres',
			'-f',
			'/tmp/bootstrap.sql',
		])
	}
	const connection = `postgresql://hcm_migrator:${config.migratorPassword}@127.0.0.1:${config.port}/hcm_db`
	const inventory = resolve('libs/hcm/api/database/migrations/sql')
	const migrations = await migrateHcmDatabase(connection, inventory)
	const seeds = await runDevelopmentSeeds({
		env: {
			APP_ENVIRONMENT: 'local',
			NODE_ENV: 'development',
			HCM_SEED_TARGET: 'local-dunder-mifflin',
			HCM_SEED_DATABASE_URL: connection,
		},
		manifestDirectory: resolve('libs/hcm/api/database/seed/manifest'),
		migrations: await loadSqlMigrations(inventory),
	})
	const client = new Client({ connectionString: connection })
	try {
		await client.connect()
		await client.query('SELECT 1')
	} finally {
		await client.end()
	}
	console.log(
		`Persistent hcm_db ready at 127.0.0.1:${config.port}; ${migrations.length} migrations and ${seeds.length} seed versions applied. Credentials are private in .local/hcm/database.json.`,
	)
}

try {
	await main()
} catch {
	console.error(
		'Persistent HCM database setup failed. No data was automatically deleted. Check Docker, local resource ownership and the private credential file; provider diagnostics are suppressed.',
	)
	process.exitCode = 1
}
