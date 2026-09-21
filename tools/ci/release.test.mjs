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

function cloud({
	missing = false,
	denied = false,
	immutable = true,
	traffic = true,
	serviceMissing = false,
	invalidDigest = false,
} = {}) {
	const calls = []
	let published = !missing
	let deployedImage
	function execute(command, args) {
		calls.push([command, ...args])
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

test('rejects non-main dispatches, malformed SHA, unknown deployables and environments before executing commands', () => {
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
		assert.throws(() =>
			validateRelease(
				{ ...env, ...change },
				manifest,
				(...args) => calls.push(args),
				() => true,
			),
		)
		assert.equal(calls.length, 0)
	}
})

test('requires the production Dockerfile and a commit reachable from main', () => {
	assert.throws(
		() =>
			validateRelease(
				env,
				manifest,
				() => '',
				() => false,
			),
		/Dockerfile/,
	)
	const calls = []
	assert.equal(
		validateRelease(
			env,
			manifest,
			(...args) => calls.push(args),
			() => true,
		),
		config,
	)
	assert.deepEqual(calls[1], ['git', ['merge-base', '--is-ancestor', sha, 'origin/main']])
	assert.throws(
		() =>
			validateRelease(
				env,
				manifest,
				() => {
					throw new Error('not on main')
				},
				() => true,
			),
		/not on main/,
	)
})

test('release retry reuses an existing digest without building or pushing', () => {
	const { calls, execute } = cloud()
	const result = releaseImage(env, config, execute)
	assert.equal(result.digest, digest)
	assert.equal(result.reused, true)
	assert.equal(
		calls.some(([command]) => command === 'docker'),
		false,
	)
})

test('first release builds and pushes once and then resolves its digest', () => {
	const { calls, execute } = cloud({ missing: true })
	const result = releaseImage(env, config, execute)
	assert.equal(result.reused, false)
	assert.equal(result.digest, digest)
	assert.deepEqual(
		calls.filter(([command]) => command === 'docker').map((call) => call[1]),
		['build', 'push'],
	)
})

test('registry permission failures and mutable tags never trigger a build', () => {
	for (const options of [{ denied: true }, { immutable: false }, { invalidDigest: true }]) {
		const { calls, execute } = cloud(options)
		assert.throws(() => releaseImage(env, config, execute))
		assert.equal(
			calls.some(([command]) => command === 'docker'),
			false,
		)
	}
})

test('promotion and rollback use the same digest in all environments without rebuilding', () => {
	for (const environment of ['dev', 'qa', 'prod']) {
		const { calls, execute } = cloud()
		const result = releaseImage(
			{ ...env, RELEASE_MODE: 'deploy', DEPLOY_ENVIRONMENT: environment },
			config,
			execute,
		)
		assert.equal(
			calls.some(([command]) => command === 'docker'),
			false,
		)
		const update = calls.find((call) => call[3] === 'update')
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

test('missing artifacts, missing services and pinned traffic fail without a deployment or rebuild', () => {
	for (const options of [{ missing: true }, { serviceMissing: true }, { traffic: false }]) {
		const { calls, execute } = cloud(options)
		assert.throws(() => releaseImage({ ...env, RELEASE_MODE: 'deploy' }, config, execute))
		assert.equal(
			calls.some(([command]) => command === 'docker'),
			false,
		)
		assert.equal(
			calls.some((call) => call[3] === 'update'),
			false,
		)
	}
})
