import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

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
	'docs/hcm/architecture/HCM-AUTHORITY.md',
	'docs/hcm/architecture/DATABASE-STRATEGY.md',
	'docs/hcm/catalogue/hcm-app-catalogue.json',
	'docs/hcm/catalogue/hcm-launchpad.json',
	'docs/hcm/engineering/AI-APP-FACTORY.md',
	'docs/hcm/engineering/FACTORY-INSTALLATION-REPORT.md',
	'docs/hcm/roadmap/HCM-0-WORK-BREAKDOWN.md',
]

const missing = required.filter(
	/** Select required source-of-truth documents missing from the working tree. */ (path) =>
		!existsSync(path),
)
if (missing.length) {
	console.error('Missing required architecture documentation:')
	for (const path of missing) console.error(` - ${path}`)
	process.exit(1)
}
console.log('Documentation verification passed.')

const catalogueCheck = spawnSync(
	process.execPath,
	['tools/hcm-factory/generate-runtime-catalogue.mjs', '--check'],
	{ stdio: 'inherit' },
)
if (catalogueCheck.status !== 0) process.exit(catalogueCheck.status ?? 1)
