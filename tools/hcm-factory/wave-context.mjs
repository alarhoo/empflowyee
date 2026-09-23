import fs from 'node:fs'
import path from 'node:path'
import { catalogue, root } from './lib.mjs'

const arg = process.argv.find(
	/** Locate the requested delivery wave. */ (x) => x.startsWith('--wave='),
)
if (!arg) {
	console.error('Usage: node tools/hcm-factory/wave-context.mjs --wave=HCM-2')
	process.exit(2)
}

const wave = arg.slice('--wave='.length).toUpperCase()
if (!/^HCM-[0-9]$/.test(wave)) {
	console.error(`Unknown wave ${wave}; current roadmap defines HCM-0 through HCM-9.`)
	process.exit(1)
}
const apps = catalogue.apps.filter(
	/** Select apps assigned to this approved roadmap wave. */ (a) => a.deliveryWave === wave,
)
const byDomain = apps.reduce(
	/** Collect app entries under their stable code ownership domain. */ (map, app) => {
		;(map[app.domain] ??= []).push(app)
		return map
	},
	{},
)

const documents = [
	'docs/hcm/architecture/HCM-AUTHORITY.md',
	'docs/hcm/roadmap/HCM-DELIVERY-WAVES.md',
]
if (wave === 'HCM-0')
	documents.push(
		'docs/hcm/roadmap/HCM-0-AI-ENGINEERING-FACTORY.md',
		'docs/hcm/roadmap/HCM-0-WORK-BREAKDOWN.md',
		'docs/hcm/architecture/APP-CATALOGUE-ARCHITECTURE.md',
		'docs/hcm/architecture/DATABASE-STRATEGY.md',
		'docs/hcm/engineering/REAL-DATA-POLICY.md',
		'docs/hcm/engineering/AI-APP-FACTORY.md',
		'docs/hcm/tdd/TDD-HCM-PRODUCTION-SHELL.md',
		'docs/hcm/security/HCM-SHELL-SECURITY-INVARIANTS.md',
	)

const result = {
	wave,
	scope: wave === 'HCM-0' ? 'engineering-foundation' : 'business-apps',
	documents,
	count: apps.length,
	domains: Object.fromEntries(
		Object.entries(byDomain)
			.sort(
				/** Stabilize domain ordering across repeated context runs. */ ([a], [b]) =>
					a.localeCompare(b),
			)
			.map(
				/** Emit sorted stable app codes per domain. */ ([domain, domainApps]) => [
					domain,
					domainApps.map(/** Extract the canonical app identity. */ (a) => a.appCode).sort(),
				],
			),
	),
	reminder:
		'Context generation does not approve a wave. HCM-0 has no business apps; review its foundation work breakdown separately.',
}

const out = path.join(root, '.tmp/hcm-factory')
fs.mkdirSync(out, { recursive: true })
const target = path.join(out, `${wave}.context.json`)
fs.writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`)
console.log(target)
console.log(JSON.stringify(result, null, 2))
