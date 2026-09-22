import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const required = [
	'docs/hcm/tdd/TDD-HCM-SHELL-THEME-LAB.md',
	'docs/hcm/adr/ADR-0002-her-theme-as-horizon-overlay.md',
	'docs/hcm/architecture/shell/README.md',
	'libs/hcm/web/runtime/context/project.json',
	'libs/hcm/web/navigation/catalog/project.json',
	'libs/hcm/web/ux/theme/project.json',
	'libs/hcm/web/shell/project.json',
	'libs/hcm/web/ux/feature-theme-lab/project.json',
]
const missing = required.filter(
	/** Identify missing documentation or materialized Nx projects. */ (path) => !existsSync(path),
)
if (missing.length) {
	console.error('Missing HCM milestone files:', missing.join(', '))
	process.exit(1)
}
const expected = 'f7718d406bb464a6c4909675fca385da1246a13a2c0cf43d57710111f51b89ac'
for (const path of [
	'templates/hcm-shell-theme-lab/hcm-web-ux-theme/src/lib/styles/_hcm-theme-her.scss',
	'libs/hcm/web/ux/theme/src/lib/styles/_hcm-theme-her.scss',
]) {
	const actual = createHash('sha256').update(readFileSync(path)).digest('hex')
	if (actual !== expected) throw new Error('Supplied HER stylesheet changed: ' + path)
}
console.log('HCM milestone projects and original HER stylesheet integrity verified.')
