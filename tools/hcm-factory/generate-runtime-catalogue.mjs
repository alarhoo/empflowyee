import fs from 'node:fs'
import path from 'node:path'
import { format } from 'prettier'
import { catalogue, launchpad, root } from './lib.mjs'
import './validate-catalogue.mjs'

const domains = JSON.parse(
	fs.readFileSync(path.join(root, 'docs/hcm/catalogue/hcm-domain-catalogue.json'), 'utf8'),
).domains
const apps = catalogue.apps.map(
	/** Select runtime metadata without importing requirements or source implementation. */ (app) => {
		const {
			appCode,
			title,
			domain,
			catalogueIds,
			route,
			floorplan,
			implementationStatus,
			fddStatus,
			tddStatus,
			discoveryPolicy,
		} = app
		if (!discoveryPolicy?.permission || !discoveryPolicy.entitlement)
			throw new Error(`${appCode}: missing discovery policy`)
		if (
			!domains.some(
				/** Verify canonical domain ownership before emitting the shared projection. */ (entry) =>
					entry.domain === domain && entry.apps.includes(appCode),
			)
		)
			throw new Error(`${appCode}: domain catalogue mismatch`)
		return {
			appCode,
			title,
			domain,
			catalogueIds,
			route,
			floorplan,
			implementationStatus,
			fddStatus,
			tddStatus,
			discoveryPolicy,
		}
	},
)
const projection = {
	apps,
	spaces: launchpad.spaces,
	pages: launchpad.pages,
	businessRoles: launchpad.businessRoles,
	domains,
}
const content = await format(
	`// Generated from current canonical HCM catalogue JSON. Run pnpm hcm:catalogue:generate; do not edit.\nimport type { HcmCatalogue } from './hcm-catalogue'\nexport const HCM_CATALOGUE: HcmCatalogue = ${JSON.stringify(projection)}\n`,
	{ parser: 'typescript', useTabs: true, semi: false, singleQuote: true, printWidth: 100 },
)
const target = path.join(root, 'libs/hcm/contracts/runtime/src/lib/hcm-catalogue.generated.ts')
if (process.argv.includes('--check')) {
	if (
		!fs.existsSync(target) ||
		fs.readFileSync(target, 'utf8').replaceAll('\r\n', '\n') !== content
	) {
		console.error('Runtime catalogue is stale. Run pnpm hcm:catalogue:generate.')
		process.exitCode = 1
	} else console.log('Runtime catalogue matches canonical metadata.')
} else {
	fs.writeFileSync(target, content)
	console.log(`Generated runtime catalogue: ${apps.length} apps, ${domains.length} domains.`)
}
