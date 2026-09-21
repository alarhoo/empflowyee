import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * Convert comma-separated affected Nx projects into a deduplicated GitHub matrix of manifest deployables.
 * Libraries, end-to-end projects and unknown names are omitted; no matches produce an empty include array.
 */
export function releaseMatrix(manifest, projects) {
	const include = [
		...new Set(
			projects
				.split(',')
				.map(/** Normalize whitespace around an affected Nx project name. */ (item) => item.trim())
				.filter(Boolean),
		),
	]
		.filter(
			/** Keep only project names explicitly owned by the deployment manifest. */ (project) =>
				Object.hasOwn(manifest.deployables, project),
		)
		.map(
			/** Create the project entry consumed by the reusable build workflow matrix. */ (
				project,
			) => ({ project: project }),
		)
	return { include }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const manifest = JSON.parse(readFileSync('ci/deployables.json', 'utf8'))
	const matrix = releaseMatrix(manifest, process.env.AFFECTED_PROJECTS ?? '')
	process.stdout.write(`matrix=${JSON.stringify(matrix)}\ncount=${matrix.include.length}\n`)
}
