import fs from 'node:fs'
import path from 'node:path'
import { runNx } from './nx-cli.mjs'

const projectName = process.argv[2]
if (!projectName) {
	console.error('Usage: node tools/containers/stage-angular-output.mjs <nx-project>')
	process.exit(1)
}

const root = process.cwd()
const result = runNx(['show', 'project', projectName, '--json'])
const project = JSON.parse(result.stdout)
const build = project.targets?.build
if (!build) throw new Error(`${projectName} has no build target`)

const raw = build.options?.outputPath
let base
let browserSubdir

if (typeof raw === 'string') {
	base = path.resolve(root, raw)
} else if (raw && typeof raw === 'object') {
	const baseValue = raw.base ?? raw.root
	if (!baseValue) throw new Error(`${projectName} outputPath object has no base/root property`)
	base = path.resolve(root, baseValue)
	browserSubdir = raw.browser
} else {
	throw new Error(
		`${projectName} build target has no explicit outputPath; inspect Nx project output before containerizing`,
	)
}

const candidates = []
if (browserSubdir) candidates.push(path.join(base, browserSubdir))
candidates.push(path.join(base, 'browser'))
candidates.push(base)

const source = candidates.find(
	/** Identify an existing browser output by its entry document. */ (candidate) =>
		fs.existsSync(path.join(candidate, 'index.html')),
)
if (!source) {
	throw new Error(
		`Could not locate Angular index.html for ${projectName}. Checked:\n${candidates.map(/** Format each inspected output path for the failure message. */ (p) => ` - ${p}`).join('\n')}`,
	)
}

const target = path.join(root, '.container-output', 'static')
fs.rmSync(target, { recursive: true, force: true })
fs.mkdirSync(target, { recursive: true })
fs.cpSync(source, target, {
	recursive: true,
	// Local development configuration must never be copied into release image layers.
	filter: /** Exclude the local config that the container will replace at startup. */ (file) =>
		path.relative(source, file).replaceAll('\\', '/') !== 'assets/config.json',
})
console.log(`Staged ${projectName} static output from ${source} -> ${target}`)
