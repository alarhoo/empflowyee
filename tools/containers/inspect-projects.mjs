import fs from 'node:fs'
import path from 'node:path'
import { runNx } from './nx-cli.mjs'

const root = process.cwd()
const manifestPath = path.join(root, 'containers', 'deployables.json')

if (!fs.existsSync(manifestPath)) {
	console.error(`Missing ${manifestPath}. Apply the container foundation overlay first.`)
	process.exit(1)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const inventory = {
	generatedAt: new Date().toISOString(),
	workspaceRoot: root,
	projects: [],
}

for (const item of manifest.deployables) {
	const result = runNx(['show', 'project', item.project, '--json'], { allowFailure: true })
	if (result.status !== 0) {
		inventory.projects.push({
			...item,
			found: false,
			error: (result.stderr || result.stdout).trim(),
		})
		continue
	}

	let project
	try {
		project = JSON.parse(result.stdout)
	} catch (error) {
		inventory.projects.push({
			...item,
			found: false,
			error: `Could not parse Nx JSON: ${error.message}`,
		})
		continue
	}

	const build = project.targets?.build ?? project.targets?.['next:build'] ?? null
	let buildDetails = null
	if (build) {
		buildDetails = {
			executor: build.executor ?? null,
			command: build.command ?? null,
			outputs: build.outputs ?? null,
			outputPath: build.options?.outputPath ?? null,
			defaultConfiguration: build.defaultConfiguration ?? null,
		}
	}
	inventory.projects.push({
		...item,
		found: true,
		root: project.root,
		projectType: project.projectType,
		tags: project.tags ?? [],
		build: buildDetails,
		targets: Object.keys(project.targets ?? {}).sort(),
	})
}

const outDir = path.join(root, '.tmp')
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, 'container-project-inventory.json')
fs.writeFileSync(outPath, `${JSON.stringify(inventory, null, 2)}\n`)

console.log(`Wrote ${path.relative(root, outPath)}`)
for (const p of inventory.projects) {
	console.log(
		`${p.found ? 'OK ' : 'ERR'} ${p.project} (${p.runtime})${p.build?.outputPath ? ` -> ${JSON.stringify(p.build.outputPath)}` : ''}`,
	)
}

if (
	inventory.projects.some(
		/** Detect any project that could not be resolved by Nx. */ (p) => !p.found,
	)
)
	process.exitCode = 2
