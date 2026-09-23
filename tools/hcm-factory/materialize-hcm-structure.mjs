import fs from 'node:fs'
import path from 'node:path'
import { catalogue, root } from './lib.mjs'
import './validate-catalogue.mjs'

const dryRun = process.argv.includes('--dry-run')
const mapOnly = process.argv.includes('--map-only')
const domains = [
	...new Set(catalogue.apps.map(/** Collect validated domain directory names. */ (a) => a.domain)),
].sort()
const dirs = new Set([
	'libs/hcm/web/shell',
	'libs/hcm/web/runtime',
	'libs/hcm/web/navigation',
	'libs/hcm/web/ux',
	'libs/hcm/api/database/migrations',
	'libs/hcm/api/database/seed',
	'libs/hcm/api/database/kysely',
	'libs/hcm/contracts',
	'docs/hcm/apps',
	'docs/hcm/domains',
])

for (const domain of domains) {
	dirs.add(`libs/hcm/web/${domain}/data-access`)
	dirs.add(`libs/hcm/web/${domain}/ui`)
	dirs.add(`libs/hcm/web/${domain}/util`)
	dirs.add(`libs/hcm/api/${domain}/domain`)
	dirs.add(`libs/hcm/api/${domain}/application`)
	dirs.add(`libs/hcm/api/${domain}/infrastructure`)
	dirs.add(`libs/hcm/api/${domain}/transport`)
	dirs.add(`libs/hcm/api/${domain}/module`)
	dirs.add(`libs/hcm/contracts/${domain}`)
	dirs.add(`docs/hcm/domains/${domain}`)
}

for (const app of catalogue.apps) {
	dirs.add(app.featurePath)
	const slug = app.appCode.toLowerCase().replaceAll('_', '-')
	dirs.add(`docs/hcm/apps/${slug}`)
}

const sorted = [...dirs].sort()
if (!mapOnly && !dryRun) {
	for (const rel of sorted) fs.mkdirSync(path.join(root, rel), { recursive: true })
}

const byDomain = Object.groupBy(
	catalogue.apps,
	/** Group map entries by business ownership. */ (a) => a.domain,
)
const lines = [
	'# Planned HCM codebase map',
	'',
	'> Generated from `docs/hcm/catalogue/hcm-app-catalogue.json`.',
	'>',
	'> Directory presence does not mean an Nx project exists. Nx projects are generated only when an approved implementation requires them.',
	'',
	'```text',
	'libs/hcm/',
	'├── web/',
	'│   ├── shell/',
	'│   ├── runtime/',
	'│   ├── navigation/',
	'│   ├── ux/',
]
for (const domain of Object.keys(byDomain).sort()) {
	lines.push(`│   ├── ${domain}/`)
	lines.push('│   │   ├── data-access/')
	lines.push('│   │   ├── ui/')
	lines.push('│   │   ├── util/')
	for (const app of [...byDomain[domain]].sort(
		/** Stabilize feature ordering in the generated map. */ (a, b) =>
			a.appCode.localeCompare(b.appCode),
	)) {
		const slug = app.appCode.toLowerCase().replaceAll('_', '-')
		lines.push(`│   │   └── feature-${slug}/    # ${app.appCode}`)
	}
}
lines.push('├── api/')
lines.push('│   ├── database/')
lines.push('│   │   ├── migrations/')
lines.push('│   │   ├── seed/')
lines.push('│   │   └── kysely/')
for (const domain of Object.keys(byDomain).sort()) {
	lines.push(`│   ├── ${domain}/`)
	lines.push('│   │   ├── domain/')
	lines.push('│   │   ├── application/')
	lines.push('│   │   ├── infrastructure/')
	lines.push('│   │   ├── transport/')
	lines.push('│   │   └── module/')
}
lines.push('└── contracts/')
for (const domain of Object.keys(byDomain).sort()) lines.push(`    ├── ${domain}/`)
lines.push('```', '')
lines.push(`Domains: ${domains.length}`)
lines.push(`Apps: ${catalogue.apps.length}`)

const mapPath = path.join(root, 'docs/hcm/architecture/HCM-CODEBASE-MAP.generated.md')
if (!dryRun) {
	fs.mkdirSync(path.dirname(mapPath), { recursive: true })
	fs.writeFileSync(mapPath, `${lines.join('\n')}\n`)
}

let operation = mapOnly ? 'Mapped' : 'Materialized'
if (dryRun) operation = 'Would materialize'
console.log(
	`${operation} ${sorted.length} directories across ${domains.length} domains and ${catalogue.apps.length} apps.`,
)
if (!dryRun) console.log(`Codebase map: ${path.relative(root, mapPath).replaceAll('\\', '/')}`)
if (dryRun) console.log(sorted.join('\n'))
