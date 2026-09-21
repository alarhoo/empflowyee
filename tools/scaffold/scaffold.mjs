import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const SCAFFOLD_VERSION = '1.0.9'
const requiredScaffoldFiles = [
	'tools/scaffold/preflight.mjs',
	'tools/scaffold/run-nx.mjs',
	'tools/scaffold/run-pnpm.mjs',
	'tools/scaffold/scaffold-projects.mjs',
	'tools/scaffold/install-ui-stacks.mjs',
	'tools/scaffold/project-manifest.json',
	'tools/architecture/verify.mjs',
	'tools/documentation/verify.mjs',
]

const missingFiles = requiredScaffoldFiles.filter(
	/** Identify scaffold bundle files missing from the current repository root. */ (file) =>
		!existsSync(join(process.cwd(), file)),
)
if (missingFiles.length) {
	console.error(
		`\nempFLOWyee scaffold ${SCAFFOLD_VERSION} cannot start because the scaffold installation is incomplete.`,
	)
	console.error('Missing files:')
	for (const file of missingFiles) console.error(`  - ${file}`)
	console.error('\nApply the cumulative scaffold repair package, then rerun `pnpm scaffold`.')
	process.exit(1)
}

// Load preflight only after verifying the scaffold bundle is complete. This
// avoids opaque ERR_MODULE_NOT_FOUND errors when a partial hotfix was applied.
await import('./preflight.mjs')
const { runNx } = await import('./run-nx.mjs')

console.log(`empFLOWyee scaffold ${SCAFFOLD_VERSION} starting...`)
console.log(`Node: ${process.version}`)
console.log(`Platform: ${process.platform} ${process.arch}`)

/**
 * Run a scaffold stage with the current Node runtime and inherited output.
 * Throw on launch or exit failure so later stages cannot run after a partial scaffold.
 */
function runNodeScript(relativePath, label) {
	console.log(`\n> ${label}`)
	const result = spawnSync(process.execPath, [join(process.cwd(), relativePath)], {
		stdio: 'inherit',
		env: { ...process.env, NX_INTERACTIVE: 'false' },
		shell: false,
	})

	if (result.error) throw result.error
	if (result.status !== 0) {
		throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`)
	}
}

// Run Node scripts directly; avoid recursively invoking pnpm scripts from
// inside pnpm. This keeps Windows/Corepack launchers out of orchestration.
runNodeScript('tools/scaffold/scaffold-projects.mjs', 'scaffold projects')
runNodeScript('tools/scaffold/install-ui-stacks.mjs', 'install UI stacks')
runNodeScript('tools/architecture/verify.mjs', 'architecture check')
runNodeScript('tools/documentation/verify.mjs', 'documentation check')

console.log('\n> nx format:write')
runNx(['format:write'])

console.log('\nempFLOWyee foundation scaffold complete.')
console.log(
	'Next: inspect `pnpm graph`, commit the baseline, then build the HCM shell/UX foundation.',
)
