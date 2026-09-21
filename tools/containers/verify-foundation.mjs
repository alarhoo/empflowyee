import fs from 'node:fs'
import path from 'node:path'
import { runNx } from './nx-cli.mjs'

const root = process.cwd()
const requiredFiles = [
	'containers/deployables.json',
	'containers/angular/nginx.conf',
	'containers/angular/docker-entrypoint.d/10-runtime-config.sh',
	'docs/platform/adr/ADR-container-runtime-strategy.md',
	'docs/platform/engineering/nx-docker-integration.md',
]

let failed = false
for (const rel of requiredFiles) {
	if (!fs.existsSync(path.join(root, rel))) {
		console.error(`MISSING ${rel}`)
		failed = true
	}
}

if (failed) process.exit(1)

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'containers/deployables.json'), 'utf8'))
const releaseManifest = JSON.parse(fs.readFileSync(path.join(root, 'ci/deployables.json'), 'utf8'))
const nodeVersion = fs.readFileSync(path.join(root, '.node-version'), 'utf8').trim()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
if (packageJson.devEngines?.runtime?.version !== nodeVersion) {
	throw new Error('Managed Node and container Node versions must match .node-version')
}
if (manifest.deployables.length !== Object.keys(releaseManifest.deployables).length) {
	throw new Error('Container and release manifests disagree about the deployable count')
}
for (const d of manifest.deployables) {
	const result = runNx(['show', 'project', d.project, '--json'], { allowFailure: true })
	if (result.status !== 0) {
		console.error(`MISSING NX PROJECT ${d.project}`)
		failed = true
		continue
	}
	const project = JSON.parse(result.stdout)
	const tags = new Set(project.tags ?? [])
	if (!tags.has('type:app')) {
		throw new Error(`${d.project}: expected tag type:app`)
	}
	const release = releaseManifest.deployables[d.project]
	if (
		!release ||
		project.root !== d.path ||
		release.dockerfile !== `${d.path}/Dockerfile` ||
		release.context !== '.'
	) {
		throw new Error(`${d.project}: container, release and Nx roots disagree`)
	}
	const dockerfile = fs.readFileSync(path.join(root, release.dockerfile), 'utf8')
	for (const product of ['account', 'hcm', 'console']) {
		const manifestCopy = `COPY apps/${product}/api/package.json ./apps/${product}/api/package.json`
		if (!dockerfile.includes(manifestCopy)) {
			throw new Error(
				`${d.project}: dependency stage must include every workspace package manifest`,
			)
		}
	}
	if (!dockerfile.includes(`node:${nodeVersion}-`) || /<[^>]+OUTPUT[^>]*>/.test(dockerfile)) {
		throw new Error(`${d.project}: Dockerfile version or output path is unresolved`)
	}
	const target = project.targets['docker:build']
	if (!target || target.options?.cwd !== '.' || !project.targets['docker:run']) {
		throw new Error(`${d.project}: official Docker targets must use the repository build context`)
	}
	if (target.cache !== false || target.dependsOn.length !== 0) {
		throw new Error(
			`${d.project}: self-contained Docker builds must own their build steps and image cache`,
		)
	}
	if (d.runtime === 'nest-node') {
		for (const targetName of ['build', 'prune-lockfile', 'copy-workspace-modules', 'prune']) {
			if (!project.targets[targetName]) throw new Error(`${d.project}: missing ${targetName}`)
		}
		if (!fs.existsSync(path.join(root, d.path, 'package.json'))) {
			throw new Error(`${d.project}: prune requires an explicit production package manifest`)
		}
	}
}

if (failed) process.exit(1)
console.log(
	'Container foundation verified: seven deployables, consistent manifests, pinned Node, Nx Docker targets and API prune targets.',
)
console.log(
	'Image build/run proof is separate: pnpm exec node tools/containers/smoke.mjs <projects>.',
)
