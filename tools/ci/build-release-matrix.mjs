import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function releaseMatrix(manifest, projects) {
	const include = [
		...new Set(
			projects
				.split(',')
				.map((item) => item.trim())
				.filter(Boolean),
		),
	]
		.filter((project) => Object.hasOwn(manifest.deployables, project))
		.map((project) => ({ project: project }))
	return { include }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const manifest = JSON.parse(readFileSync('ci/deployables.json', 'utf8'))
	const matrix = releaseMatrix(manifest, process.env.AFFECTED_PROJECTS ?? '')
	process.stdout.write(`matrix=${JSON.stringify(matrix)}\ncount=${matrix.include.length}\n`)
}
