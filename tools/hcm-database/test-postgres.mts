import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'

/** Run Docker without a shell and keep random test credentials out of command output. */
function docker(args: string[]): string {
	try {
		return execFileSync('docker', args, {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			timeout: 120000,
			windowsHide: true,
		}).trim()
	} catch {
		throw new Error(
			'Disposable PostgreSQL command failed; ensure Docker is running and the postgres:17-alpine image is available',
		)
	}
}

/** Start an isolated real PostgreSQL instance and exercise the same explicit provisioning script as operators. */
export default async function setup(): Promise<() => void> {
	const name = `hcm-database-test-${randomUUID()}`
	const password = randomBytes(24).toString('hex')
	const migrator = randomBytes(24).toString('hex')
	const runtime = randomBytes(24).toString('hex')
	try {
		docker([
			'run',
			'--detach',
			'--rm',
			'--name',
			name,
			'--publish',
			'127.0.0.1::5432',
			'--env',
			`POSTGRES_PASSWORD=${password}`,
			'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24',
		])
		let ready = false
		for (let attempt = 0; attempt < 60; attempt++) {
			try {
				docker(['exec', name, 'pg_isready', '-U', 'postgres', '-h', '127.0.0.1'])
				ready = true
				break
			} catch {
				await setTimeout(500)
			}
		}
		if (!ready) throw new Error('Disposable PostgreSQL did not become ready')
		docker(['cp', resolve('tools/hcm-database/bootstrap.sql'), `${name}:/tmp/bootstrap.sql`])
		docker([
			'exec',
			'--env',
			`HCM_MIGRATOR_PASSWORD=${migrator}`,
			'--env',
			`HCM_RUNTIME_PASSWORD=${runtime}`,
			name,
			'psql',
			'-U',
			'postgres',
			'-d',
			'postgres',
			'-f',
			'/tmp/bootstrap.sql',
		])
		const port = docker(['port', name, '5432/tcp']).split(':').at(-1)
		process.env['HCM_TEST_MIGRATOR'] =
			`postgresql://hcm_migrator:${migrator}@127.0.0.1:${port}/hcm_db`
		process.env['HCM_TEST_RUNTIME'] = `postgresql://hcm_runtime:${runtime}@127.0.0.1:${port}/hcm_db`
		process.env['HCM_TEST_ADMIN'] = `postgresql://postgres:${password}@127.0.0.1:${port}/hcm_db`
		console.log('Disposable PostgreSQL ready; passwords and connection strings are suppressed.')
	} catch (error) {
		docker(['rm', '--force', name])
		throw error
	}
	return /** Remove only the uniquely named container owned by this test run. */ () => {
		docker(['rm', '--force', name])
	}
}
