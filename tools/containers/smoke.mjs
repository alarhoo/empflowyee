import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { setTimeout } from 'node:timers/promises'

const manifest = JSON.parse(readFileSync('containers/deployables.json', 'utf8'))
const projects = process.argv.slice(2)
if (!projects.length) throw new Error('Pass the Nx projects whose images have already been built')

/** Execute Docker with separate arguments and capture bounded diagnostic output. */
function docker(...args) {
	return execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim()
}

/** Wait for HTTP readiness while the container initializes, failing within a bounded interval. */
async function waitReady(baseUrl) {
	for (let attempt = 0; attempt < 60; attempt++) {
		try {
			const response = await fetch(`${baseUrl}/health/ready`, { signal: AbortSignal.timeout(1000) })
			if (response.ok) return
		} catch {
			// A new listener can refuse connections before its startup validation completes.
		}
		await setTimeout(500)
	}
	throw new Error('Container did not become ready within 30 seconds')
}

for (const project of projects) {
	const deployable = manifest.deployables.find(
		/** Resolve only a declared deployable before running its image. */ (item) =>
			item.project === project,
	)
	assert.ok(deployable, `Unknown deployable: ${project}`)
	const image = deployable.path.replaceAll('/', '-')
	const imageId = docker('image', 'inspect', '--format', '{{.Id}}', image)
	const user = docker('image', 'inspect', '--format', '{{.Config.User}}', image)
	assert.ok(user && user !== 'root' && user !== '0', 'Images must run as a non-root user')
	for (const environment of ['dev', 'qa']) {
		const port = deployable.runtime === 'angular-static' ? 8080 : 9090
		const releaseId = 'smoke-release'
		const args = [
			'run',
			'--detach',
			'--publish',
			`127.0.0.1::${port}`,
			'--env',
			`PORT=${port}`,
			'--env',
			`APP_ENVIRONMENT=${environment}`,
			'--env',
			`RELEASE_ID=${releaseId}`,
		]
		if (deployable.runtime === 'angular-static')
			args.push('--env', `API_BASE_URL=https://${environment}.example.test/api`)
		const container = docker(...args, image)
		try {
			const address = docker('port', container, `${port}/tcp`)
			const baseUrl = `http://${address}`
			await waitReady(baseUrl)
			assert.equal((await fetch(`${baseUrl}/health/live`)).status, 200)
			assert.equal(docker('inspect', '--format', '{{.Image}}', container), imageId)
			if (deployable.runtime === 'angular-static') {
				const response = await fetch(`${baseUrl}/assets/config.json`)
				assert.equal(response.headers.get('cache-control'), 'no-store')
				assert.deepEqual(await response.json(), {
					environment,
					releaseId,
					apiBaseUrl: `https://${environment}.example.test/api`,
				})
				const html = await (await fetch(`${baseUrl}/nested/route`)).text()
				assert.ok(html.includes('<!doctype html>') || html.includes('<!DOCTYPE html>'))
				const asset = html.match(/src="(main-[^"]+\.js)"/)
				assert.ok(asset, 'SPA must serve its compiled main bundle')
				const bundle = await fetch(`${baseUrl}/${asset[1]}`)
				assert.equal(bundle.status, 200)
				assert.ok(bundle.headers.get('cache-control')?.includes('immutable'))
			} else if (deployable.runtime === 'next') {
				const response = await fetch(`${baseUrl}/api/runtime-config`)
				assert.equal(response.headers.get('cache-control'), 'no-store')
				assert.deepEqual(await response.json(), { environment, releaseId })
				assert.equal((await fetch(baseUrl)).status, 200)
			} else {
				assert.equal((await fetch(`${baseUrl}/api`)).status, 200)
				assert.ok(docker('logs', container).includes(`"environment":"${environment}"`))
			}
			docker('stop', '--time', '10', container)
			const exitCode = Number(docker('inspect', '--format', '{{.State.ExitCode}}', container))
			assert.ok([0, 143].includes(exitCode), `Ungraceful exit: ${exitCode}`)
		} catch (error) {
			console.error(docker('logs', container))
			throw error
		} finally {
			docker('rm', '--force', container)
		}
	}
	const missingContainer = docker('run', '--detach', image)
	try {
		const missingConfig = spawnSync('docker', ['wait', missingContainer], {
			encoding: 'utf8',
			timeout: 30000,
		})
		assert.equal(missingConfig.error, undefined, 'Missing configuration must terminate promptly')
		assert.equal(missingConfig.status, 0, 'Docker must report the rejected startup exit code')
		assert.notEqual(
			Number(missingConfig.stdout.trim()),
			0,
			'Missing required configuration must fail startup',
		)
	} finally {
		docker('rm', '--force', missingContainer)
	}
	console.log(
		`PASS ${project}: same image, two configurations, health, non-root execution, shutdown and missing-config rejection`,
	)
}
