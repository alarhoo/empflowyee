import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const checks = [
	['@fundamental-ngx/platform', ['dynamic-page', 'icon-tab-bar', 'smart-filter-bar', 'table']],
	['@fundamental-ngx/core', ['dynamic-page', 'scroll-spy', 'theming', 'object-status']],
	[
		'@fundamental-ngx/ui5-webcomponents-fiori',
		[
			'page',
			'dynamic-page',
			'flexible-column-layout',
			'wizard',
			'shell-bar',
			'side-navigation',
			'illustrated-message',
		],
	],
	[
		'@fundamental-ngx/ui5-webcomponents',
		['table', 'form', 'button', 'input', 'card', 'toolbar', 'tab-container'],
	],
]

let failed = false
for (const [pkg, entries] of checks) {
	let pkgJson
	try {
		pkgJson = require.resolve(`${pkg}/package.json`)
	} catch {
		console.error(`MISSING: ${pkg}`)
		failed = true
		continue
	}
	const base = dirname(pkgJson)
	const meta = JSON.parse(readFileSync(pkgJson, 'utf8'))
	console.log(`\n${pkg} ${meta.version ?? ''}`)
	for (const entry of entries) {
		let ok = false
		try {
			require.resolve(`${pkg}/${entry}`)
			ok = true
		} catch {
			const exportKey = `./${entry}`
			ok = Boolean(meta.exports && Object.prototype.hasOwnProperty.call(meta.exports, exportKey))
			if (!ok) {
				ok =
					existsSync(join(base, entry, 'package.json')) || existsSync(join(base, entry, 'index.js'))
			}
		}
		console.log(`${ok ? '  OK ' : '  ?? '} ${entry}`)
		if (!ok) {
			failed = true
			console.error(
				'       Verify with Fundamental NGX MCP/current package docs before implementation.',
			)
		}
	}
}

if (failed) process.exit(1)
console.log(
	'\nComponent entrypoint inspection complete. "??" is a verification request, not permission to guess an API.',
)
