import { existsSync } from 'node:fs'

const required = [
	'AGENTS.md',
	'docs/README.md',
	'docs/platform/architecture/deployable-topology.md',
	'docs/platform/architecture/invariants.md',
	'docs/platform/engineering/nx/project-taxonomy.md',
	'docs/platform/engineering/nx/dependency-rules.md',
	'docs/platform/frontend/angular-state-and-forms.md',
	'docs/platform/ux/architecture/ux-architecture.md',
	'docs/platform/ux/architecture/theming.md',
	'docs/platform/ux/architecture/localization.md',
	'docs/platform/ux/floorplans/catalog.md',
	'docs/platform/ux/forms/form-standard.md',
	'docs/platform/ux/tables/table-standard.md',
	'docs/hcm/adr/ADR-0001-hcm-ui-stack.md',
	'docs/hcm/ux/UI-LIBRARY-DECISION.md',
	'docs/hcm/ux/COMPONENT-CAPABILITY-MATRIX.md',
]

const missing = required.filter((path) => !existsSync(path))
if (missing.length) {
	console.error('Missing required architecture documentation:')
	for (const path of missing) console.error(` - ${path}`)
	process.exit(1)
}
console.log('Documentation verification passed.')
