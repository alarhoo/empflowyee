import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { releaseImage, validateRelease } from './release.mjs'

const manifest = JSON.parse(
	readFileSync(new URL('../../ci/deployables.json', import.meta.url), 'utf8'),
)
const sha = 'a'.repeat(40)
const digest = `sha256:${'b'.repeat(64)}`
const env = {
	GITHUB_REF: 'refs/heads/main',
	GITHUB_SHA: sha,
	RELEASE_SHA: sha,
	DEPLOYABLE: 'hcm-web',
	RELEASE_MODE: 'build',
	DEPLOY_ENVIRONMENT: 'dev',
	AR_PROJECT_ID: 'example-cicd',
	AR_REGION: 'asia-south1',
	AR_REPOSITORY: 'releases',
	CICD_WIF_PROVIDER: 'provider',
	CICD_BUILD_SERVICE_ACCOUNT: 'builder',
	GCP_PROJECT_ID: 'example-dev',
	GCP_REGION: 'asia-south1',
	DEPLOY_WIF_PROVIDER: 'provider',
	DEPLOY_SERVICE_ACCOUNT: 'deployer',
}
const config = manifest.deployables['hcm-web']

/**
 * Create an in-memory registry and Cloud Run command double for release success and failure scenarios.
 * Return its executor and command log so tests can verify effects without calling cloud tools.
 */
function cloud({
	missing = false,
	denied = false,
	immutable = true,
	traffic = true,
	serviceMissing = false,
	invalidDigest = false,
	smokeFailure = false,
} = {}) {
	const calls = []
	let published = !missing
	let deployedImage
	/** Record each requested command and simulate registry publication or Cloud Run image updates. */
	function execute(command, args) {
		calls.push([command, ...args])
		if (command === 'node' && smokeFailure) throw new Error('Container smoke test failed')
		if (args[1] === 'repositories')
			return JSON.stringify({ format: 'DOCKER', dockerConfig: { immutableTags: immutable } })
		if (args[1] === 'docker') {
			if (denied || !published) {
				const error = new Error('Registry lookup failed')
				error.stderr = denied ? 'PERMISSION_DENIED' : 'NOT_FOUND'
				throw error
			}
			return invalidDigest ? 'sha256:bad' : digest
		}
		if (command === 'docker' && args[0] === 'push') published = true
		if (args[0] === 'run' && args[2] === 'update') deployedImage = args[4].slice('--image='.length)
		if (args[0] === 'run' && args[2] === 'describe') {
			if (serviceMissing) throw new Error('Service NOT_FOUND')
			return JSON.stringify({
				spec: {
					traffic: [{ latestRevision: traffic, percent: 100 }],
					template: { spec: { containers: [{ image: deployedImage }] } },
				},
				status: {
					latestReadyRevisionName: 'hcm-web-001',
					latestCreatedRevisionName: 'hcm-web-001',
				},
			})
		}
		return ''
	}
	return { calls, execute }
}

test('rejects non-main dispatches, malformed SHA, unknown deployables and environments before executing commands', /** Verify invalid workflow inputs fail before any Git or cloud command can run. */ () => {
	for (const change of [
		{ GITHUB_REF: 'refs/heads/feature' },
		{ RELEASE_SHA: '$(touch injected)' },
		{ RELEASE_SHA: 'abc' },
		{ DEPLOYABLE: '__proto__' },
		{ RELEASE_MODE: 'unknown' },
		{ RELEASE_MODE: 'deploy', DEPLOY_ENVIRONMENT: '../../other' },
		{ AR_REGION: '' },
		{ RELEASE_SHA: 'b'.repeat(40) },
	]) {
		const calls = []
		assert.throws(
			/** Exercise validation with one malformed workflow setting and capture its rejection. */ () =>
				validateRelease(
					{ ...env, ...change },
					manifest,
					/** Record any unexpected command execution for the preflight assertion. */
					(...args) => calls.push(args),
					/** Pretend the production Dockerfile exists so only the workflow input guard is exercised. */
					() => true,
				),
		)
		assert.equal(calls.length, 0)
	}
})

test('requires the production Dockerfile and a commit reachable from main', /** Verify builds need a production Dockerfile and a release commit reachable from main. */ () => {
	assert.throws(
		/** Exercise the missing-Dockerfile guard without invoking Git. */
		() =>
			validateRelease(
				env,
				manifest,
				/** Stub successful command output for the filesystem preflight scenario. */
				() => '',
				/** Simulate an absent production Dockerfile. */
				() => false,
			),
		/Dockerfile/,
	)
	const calls = []
	assert.equal(
		validateRelease(
			env,
			manifest,
			/** Capture Git arguments to verify that ancestry is checked against origin/main. */
			(...args) => calls.push(args),
			/** Simulate the production Dockerfile being present. */
			() => true,
		),
		config,
	)
	assert.deepEqual(calls[1], ['git', ['merge-base', '--is-ancestor', sha, 'origin/main']])
	assert.throws(
		/** Exercise validation when the Git ancestry check fails. */
		() =>
			validateRelease(
				env,
				manifest,
				/** Simulate Git rejecting a release commit that is not reachable from main. */
				() => {
					throw new Error('not on main')
				},
				/** Keep the Dockerfile precondition satisfied while testing ancestry failure. */
				() => true,
			),
		/not on main/,
	)
})

test('release retry reuses an existing digest without building or pushing', /** Verify a retry reuses the published digest and does not invoke Docker. */ () => {
	const { calls, execute } = cloud()
	const result = releaseImage(env, config, execute)
	assert.equal(result.digest, digest)
	assert.equal(result.reused, true)
	assert.equal(
		calls.some(
			/** Identify image build or publication invocations in the recorded release commands. */ ([
				command,
			]) => command === 'docker' || command === 'pnpm',
		),
		false,
	)
})

test('first release builds and pushes once and then resolves its digest', /** Verify a new release builds and pushes exactly once before resolving the published digest. */ () => {
	const { calls, execute } = cloud({ missing: true })
	const result = releaseImage(env, config, execute)
	assert.equal(result.reused, false)
	assert.equal(result.digest, digest)
	const builds = calls.filter(
		/** Select image builds routed through the Nx task graph. */ ([command]) => command === 'pnpm',
	)
	assert.equal(builds.length, 1)
	assert.deepEqual(builds[0].slice(0, 5), ['pnpm', 'exec', 'nx', 'run', 'hcm-web:docker:build'])
	assert.ok(builds[0].includes(`REVISION=${sha}`))
	assert.ok(builds[0].includes(`RELEASE_ID=${sha}`))
	const pushes = calls.filter(
		/** Select Docker publication commands after the Nx build. */ ([command]) =>
			command === 'docker',
	)
	assert.equal(pushes.length, 1)
	assert.equal(pushes[0][1], 'push')
	assert.ok(calls.indexOf(builds[0]) < calls.indexOf(pushes[0]))
	const smoke = calls.find(
		/** Locate the runtime verification of the exact image that will be published. */
		([command]) => command === 'node',
	)
	assert.deepEqual(smoke, [
		'node',
		'tools/containers/smoke.mjs',
		'hcm-web',
		'--image',
		pushes[0][2],
	])
	assert.ok(calls.indexOf(builds[0]) < calls.indexOf(smoke))
	assert.ok(calls.indexOf(smoke) < calls.indexOf(pushes[0]))
})

test('failed container startup prevents publication', /** Keep broken runtime images out of the immutable release registry. */ () => {
	const { calls, execute } = cloud({ missing: true, smokeFailure: true })
	assert.throws(
		/** Simulate runtime validation failing after a successful image build. */
		() => releaseImage(env, config, execute),
		/Container smoke test failed/,
	)
	assert.equal(
		calls.some(
			/** Detect any publication that would bypass a failed runtime check. */
			([command, action]) => command === 'docker' && action === 'push',
		),
		false,
	)
})

test('registry permission failures and mutable tags never trigger a build', /** Verify unsafe registry configuration and lookup errors cannot trigger image creation. */ () => {
	for (const options of [{ denied: true }, { immutable: false }, { invalidDigest: true }]) {
		const { calls, execute } = cloud(options)
		assert.throws(
			/** Exercise release handling for the current registry failure scenario. */ () =>
				releaseImage(env, config, execute),
		)
		assert.equal(
			calls.some(
				/** Identify Docker invocations that would incorrectly rebuild after a registry error. */ ([
					command,
				]) => command === 'docker' || command === 'pnpm',
			),
			false,
		)
	}
})

test('promotion and rollback use the same digest in all environments without rebuilding', /** Verify promotion and rollback update only the immutable image in each environment. */ () => {
	for (const environment of ['dev', 'qa', 'prod']) {
		const { calls, execute } = cloud()
		const result = releaseImage(
			{ ...env, RELEASE_MODE: 'deploy', DEPLOY_ENVIRONMENT: environment },
			config,
			execute,
		)
		assert.equal(
			calls.some(
				/** Identify any Docker invocation that would rebuild during promotion. */ ([command]) =>
					command === 'docker' || command === 'pnpm',
			),
			false,
		)
		const update = calls.find(
			/** Locate the Cloud Run image-update command for argument verification. */ (call) =>
				call[3] === 'update',
		)
		assert.deepEqual(update, [
			'gcloud',
			'run',
			'services',
			'update',
			config.service,
			`--image=${result.ref}`,
			'--project=example-dev',
			'--region=asia-south1',
			'--quiet',
		])
		assert.equal(result.ref.endsWith(`@${digest}`), true)
	}
})

test('missing artifacts, missing services and pinned traffic fail without a deployment or rebuild', /** Verify missing deployment prerequisites fail before an image update or rebuild. */ () => {
	for (const options of [{ missing: true }, { serviceMissing: true }, { traffic: false }]) {
		const { calls, execute } = cloud(options)
		assert.throws(
			/** Exercise deployment with the current missing artifact, service or traffic precondition. */ () =>
				releaseImage({ ...env, RELEASE_MODE: 'deploy' }, config, execute),
		)
		assert.equal(
			calls.some(
				/** Detect Docker invocations that would rebuild a failed deployment. */ ([command]) =>
					command === 'docker' || command === 'pnpm',
			),
			false,
		)
		assert.equal(
			calls.some(
				/** Detect a Cloud Run update that would bypass a failed deployment guard. */ (call) =>
					call[3] === 'update',
			),
			false,
		)
	}
})
