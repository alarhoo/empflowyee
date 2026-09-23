import fs from 'node:fs'
import path from 'node:path'
import { appSlug, getApp, root } from './lib.mjs'
import { evaluateReadiness } from './readiness.mjs'

const arg = process.argv.find(
	/** Locate the requested canonical app code. */ (x) => x.startsWith('--app='),
)
if (!arg) {
	console.error('Usage: node tools/hcm-factory/app-context.mjs --app=EMPLOYEE_DIRECTORY')
	process.exit(2)
}

const code = arg.slice('--app='.length).toUpperCase()
if (
	process.argv
		.slice(2)
		.some(
			/** Reject unexpected switches so explicit checking cannot be misspelled. */ (value) =>
				value !== arg && value !== '--check',
		)
) {
	console.error('Supported options: --app=APP_CODE [--check]')
	process.exit(2)
}
const app = getApp(code)
if (!app) {
	console.error(`Unknown app ${code}`)
	process.exit(1)
}

const slug = appSlug(code)
const appDocsBase = path.join(root, 'docs/hcm/apps', slug)
const domainDocsBase = path.join(root, 'docs/hcm/domains', app.domain)

/** List existing current app/domain documents in stable repository-relative order. */
function existingDocs(base) {
	if (!fs.existsSync(base)) return []
	return fs
		.readdirSync(base, { recursive: true, withFileTypes: true })
		.filter(/** Exclude directory entries from document evidence. */ (e) => e.isFile())
		.map(
			/** Normalize paths for portable context artifacts. */ (e) =>
				path.relative(root, path.join(e.parentPath, e.name)).replaceAll('\\', '/'),
		)
		.sort()
}

const result = {
	app,
	readiness: evaluateReadiness(root, app),
	currentDocuments: {
		app: existingDocs(appDocsBase),
		domain: existingDocs(domainDocsBase),
	},
	expectedDocuments: [
		`docs/hcm/apps/${slug}/FDD.md`,
		`docs/hcm/apps/${slug}/TDD.md`,
		`docs/hcm/apps/${slug}/TRACEABILITY.md`,
		`docs/hcm/apps/${slug}/DECISIONS.md`,
		`docs/hcm/apps/${slug}/BLUEPRINT.json`,
		`docs/hcm/apps/${slug}/APPROVALS.json`,
	],
	expectedCode: {
		feature: app.featurePath,
		domainDataAccess: `libs/hcm/web/${app.domain}/data-access`,
		domainUi: `libs/hcm/web/${app.domain}/ui`,
		contracts: `libs/hcm/contracts/${app.domain}`,
		apiDomain: `libs/hcm/api/${app.domain}`,
	},
	gates: {
		fddApproved: app.fddStatus === 'approved',
		tddApproved: app.tddStatus === 'approved',
		zeroBlockingDecisions: app.blockingDecisionStatus === 'clear',
		fddExists: fs.existsSync(path.join(appDocsBase, 'FDD.md')),
		tddExists: fs.existsSync(path.join(appDocsBase, 'TDD.md')),
	},
	reminder:
		'Legacy gates are summary indicators. The readiness report checks reviewed evidence; human document review remains required. Context generation never approves an app.',
}

const out = path.join(root, '.tmp/hcm-factory')
fs.mkdirSync(out, { recursive: true })
const target = path.join(out, `${code}.context.json`)
fs.writeFileSync(
	target,
	`${JSON.stringify(result, null, 2)}
`,
)
console.log(target)
console.log(JSON.stringify(result, null, 2))
if (process.argv.includes('--check') && !result.readiness.ready) process.exitCode = 1
