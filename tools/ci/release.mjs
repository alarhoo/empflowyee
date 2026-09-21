import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function run(command, args) {
	return execFileSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()
}

export function validateRelease(env, manifest, execute = run, fileExists = existsSync) {
	if (env.GITHUB_REF !== 'refs/heads/main') throw new Error('Run this workflow from main only')
	if (!/^[0-9a-f]{40}$/.test(env.RELEASE_SHA ?? '')) {
		throw new Error('RELEASE_SHA must be a full 40-character lowercase commit SHA')
	}
	if (!Object.hasOwn(manifest.deployables, env.DEPLOYABLE)) throw new Error('Unknown deployable')
	const config = manifest.deployables[env.DEPLOYABLE]
	if (!['build', 'deploy'].includes(env.RELEASE_MODE)) throw new Error('Unknown release mode')
	const required = ['AR_PROJECT_ID', 'AR_REGION', 'AR_REPOSITORY']
	if (env.RELEASE_MODE === 'build') {
		if (env.RELEASE_SHA !== env.GITHUB_SHA)
			throw new Error('Build SHA must match the workflow commit')
		if (!fileExists(config.dockerfile))
			throw new Error(`Missing production Dockerfile: ${config.dockerfile}`)
		required.push('CICD_WIF_PROVIDER', 'CICD_BUILD_SERVICE_ACCOUNT')
	} else {
		if (!['dev', 'qa', 'prod'].includes(env.DEPLOY_ENVIRONMENT))
			throw new Error('Unsupported environment')
		required.push('GCP_PROJECT_ID', 'GCP_REGION', 'DEPLOY_WIF_PROVIDER', 'DEPLOY_SERVICE_ACCOUNT')
	}
	for (const key of required) {
		if (!env[key]?.trim()) throw new Error(`Missing ${key}`)
	}
	execute('git', ['cat-file', '-e', `${env.RELEASE_SHA}^{commit}`])
	execute('git', ['merge-base', '--is-ancestor', env.RELEASE_SHA, 'origin/main'])
	return config
}

export function requireImmutableRegistry(env, execute = run) {
	const repository = JSON.parse(
		execute('gcloud', [
			'artifacts',
			'repositories',
			'describe',
			env.AR_REPOSITORY,
			`--project=${env.AR_PROJECT_ID}`,
			`--location=${env.AR_REGION}`,
			'--format=json',
		]),
	)
	if (repository.format !== 'DOCKER' || repository.dockerConfig?.immutableTags !== true) {
		throw new Error('Artifact Registry must be a Docker repository with immutable tags enabled')
	}
}

export function resolveDigest(tag, execute = run, allowMissing = false) {
	let digest
	try {
		digest = execute('gcloud', [
			'artifacts',
			'docker',
			'images',
			'describe',
			tag,
			'--format=value(image_summary.digest)',
		])
	} catch (error) {
		if (allowMissing && /\bNOT_FOUND\b/.test(String(error.stderr))) return null
		throw error
	}
	if (!/^sha256:[0-9a-f]{64}$/.test(digest))
		throw new Error('Invalid or missing release image digest')
	return digest
}

export function releaseImage(env, config, execute = run) {
	requireImmutableRegistry(env, execute)
	const image = `${env.AR_REGION}-docker.pkg.dev/${env.AR_PROJECT_ID}/${env.AR_REPOSITORY}/${config.image}`
	const tag = `${image}:${env.RELEASE_SHA}`
	let digest = resolveDigest(tag, execute, env.RELEASE_MODE === 'build')
	const reused = digest !== null
	if (!digest) {
		execute('gcloud', ['auth', 'configure-docker', `${env.AR_REGION}-docker.pkg.dev`, '--quiet'])
		execute('docker', [
			'build',
			'--pull',
			'--label',
			`org.opencontainers.image.revision=${env.RELEASE_SHA}`,
			'--label',
			`com.empflowyee.nx-project=${env.DEPLOYABLE}`,
			'--file',
			config.dockerfile,
			'--tag',
			tag,
			config.context,
		])
		execute('docker', ['push', tag])
		digest = resolveDigest(tag, execute)
	}
	const ref = `${image}@${digest}`
	let revision
	if (env.RELEASE_MODE === 'deploy') {
		const scope = [`--project=${env.GCP_PROJECT_ID}`, `--region=${env.GCP_REGION}`]
		const service = JSON.parse(
			execute('gcloud', ['run', 'services', 'describe', config.service, ...scope, '--format=json']),
		)
		const traffic = service.spec?.traffic ?? []
		if (traffic.length !== 1 || !traffic[0].latestRevision || traffic[0].percent !== 100) {
			throw new Error(
				'IaC must route 100% of service traffic to the latest revision before image-only deployment',
			)
		}
		execute('gcloud', [
			'run',
			'services',
			'update',
			config.service,
			`--image=${ref}`,
			...scope,
			'--quiet',
		])
		const deployed = JSON.parse(
			execute('gcloud', ['run', 'services', 'describe', config.service, ...scope, '--format=json']),
		)
		revision = deployed.status?.latestReadyRevisionName
		if (
			!revision ||
			revision !== deployed.status.latestCreatedRevisionName ||
			deployed.spec?.template?.spec?.containers?.[0]?.image !== ref
		) {
			throw new Error('Cloud Run did not report a ready revision with the requested image')
		}
	}
	return { ref, digest, reused, revision }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const env = process.env
	const manifest = JSON.parse(readFileSync('ci/deployables.json', 'utf8'))
	const config = validateRelease(env, manifest)
	if (process.argv[2] !== 'validate') {
		const { ref, digest, reused, revision } = releaseImage(env, config)
		if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `ref=${ref}\ndigest=${digest}\n`)
		if (env.GITHUB_STEP_SUMMARY) {
			appendFileSync(
				env.GITHUB_STEP_SUMMARY,
				[
					`### ${env.DEPLOYABLE}`,
					`- Operation: ${env.RELEASE_MODE}`,
					`- Release: \`${env.RELEASE_SHA}\``,
					`- Immutable image: \`${ref}\``,
					env.RELEASE_MODE === 'build'
						? `- Existing artifact reused: ${reused}`
						: `- Environment: ${env.DEPLOY_ENVIRONMENT}`,
					...(revision ? [`- Ready revision: \`${revision}\``] : []),
					'',
				].join('\n'),
			)
		}
	}
}
