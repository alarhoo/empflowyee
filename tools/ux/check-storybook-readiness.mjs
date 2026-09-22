import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
for (const id of ['nx/package.json', '@nx/angular/package.json']) {
	try {
		require.resolve(id)
	} catch {
		console.error(`Missing ${id}. Run pnpm install.`)
		process.exit(1)
	}
}

const nxPackagePath = require.resolve('nx/package.json')
const nxPackage = JSON.parse(readFileSync(nxPackagePath, 'utf8'))
const nxBin = typeof nxPackage.bin === 'string' ? nxPackage.bin : nxPackage.bin?.nx
if (!nxBin) {
	console.error('Nx package metadata does not declare bin.nx.')
	process.exit(1)
}
const nxCli = resolve(dirname(nxPackagePath), nxBin)
console.log(`Nx: ${nxPackage.version}`)
console.log(`Nx CLI: ${nxCli}`)

try {
	const sbPath = require.resolve('storybook/package.json')
	const sb = JSON.parse(readFileSync(sbPath, 'utf8'))
	console.log(`Storybook already installed: ${sb.version}`)
} catch {
	console.log(
		'Storybook not installed yet. Expected before the official Nx Storybook generator runs.',
	)
}

const result = spawnSync(process.execPath, [nxCli, 'show', 'project', 'hcm-web', '--json'], {
	encoding: 'utf8',
})
if (result.status !== 0) {
	console.error('Unable to read Nx project hcm-web.')
	console.error(result.stderr || result.stdout)
	process.exit(result.status ?? 1)
}
console.log('hcm-web project is visible to Nx. Storybook foundation may proceed.')
