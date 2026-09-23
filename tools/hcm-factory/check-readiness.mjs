import fs from 'node:fs'
import path from 'node:path'
import { catalogue, getApp, root } from './lib.mjs'
import { evaluateReadiness } from './readiness.mjs'

const args = process.argv.slice(2)
const selectors = args.filter(
	/** Accept one explicit canonical selection scope. */ (arg) =>
		/^(--app=|--wave=|--all$|--admitted$)/.test(arg),
)
if (
	selectors.length !== 1 ||
	args.some(
		/** Reject typos instead of silently weakening a gate. */ (arg) =>
			arg !== selectors[0] && arg !== '--check',
	) ||
	new Set(args).size !== args.length
) {
	console.error(
		'Usage: check-readiness.mjs (--app=APP_CODE | --wave=HCM-N | --all | --admitted) [--check]',
	)
	process.exit(2)
}
const selector = selectors[0]
let apps = catalogue.apps
if (selector.startsWith('--app=')) {
	const app = getApp(selector.slice(6).toUpperCase())
	if (!app) {
		console.error('Unknown canonical app')
		process.exit(2)
	}
	apps = [app]
} else if (selector.startsWith('--wave=')) {
	const wave = selector.slice(7).toUpperCase()
	if (!/^HCM-[1-9]$/.test(wave)) {
		console.error(
			'Readiness checks business waves HCM-1 through HCM-9; HCM-0 uses its foundation evidence.',
		)
		process.exit(2)
	}
	apps = apps.filter(
		/** Select canonical wave membership without creating a parallel inventory. */ (app) =>
			app.deliveryWave === wave,
	)
} else if (selector === '--admitted') {
	apps = apps.filter(
		/** Require evidence when metadata claims approval or implementation has created the feature project. */ (
			app,
		) =>
			['implementing', 'complete'].includes(app.implementationStatus) ||
			app.fddStatus === 'approved' ||
			app.tddStatus === 'approved' ||
			fs.existsSync(path.join(root, app.featurePath, 'project.json')),
	)
}
const reports = apps.map(
	/** Evaluate each app using current reviewed evidence only. */ (app) =>
		evaluateReadiness(root, app),
)
const blocked = reports.filter(
	/** Count denied implementation inputs. */ (report) => !report.ready,
).length
console.log(
	JSON.stringify(
		{ checked: reports.length, ready: reports.length - blocked, blocked, reports },
		null,
		2,
	),
)
if (args.includes('--check') && blocked > 0) process.exitCode = 1
