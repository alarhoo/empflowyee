import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { nxProjectExistsAt, runNx } from './run-nx.mjs'

/**
 * Generate a missing application and verify that Nx resolves it at the requested root.
 * Existing matching projects are left intact; name collisions or failed generation stop the scaffold.
 */
function generateProject({ name, root, args }) {
	// Nx project configuration may live in project.json, package.json, or be
	// inferred by a plugin. Checking only for project.json is therefore wrong.
	// Query Nx's resolved project graph instead.
	if (nxProjectExistsAt(name, root)) {
		console.log(`Skipping existing Nx project: ${name} (${root})`)
		return
	}

	console.log(`\nGenerating Nx project: ${name} -> ${root}`)
	runNx(args)

	if (!nxProjectExistsAt(name, root)) {
		throw new Error(`Generator completed but Nx cannot resolve ${name} at ${root}.`)
	}
}

const projects = [
	{
		name: 'marketing-web',
		root: 'apps/marketing/web',
		args: [
			'g',
			'@nx/next:application',
			'apps/marketing/web',
			'--name=marketing-web',
			'--appDir=true',
			'--style=css',
			'--e2eTestRunner=playwright',
			'--tags=product:marketing,runtime:web,domain:marketing,type:app',
		],
	},
	...[
		['account', 4300, 'ef-account'],
		['hcm', 4302, 'ef-hcm'],
		['console', 4301, 'ef-console'],
	].map(
		/** Build Angular generator arguments with each product's port, selector prefix and ownership tags. */ ([
			product,
			port,
			prefix,
		]) => ({
			name: `${product}-web`,
			root: `apps/${product}/web`,
			args: [
				'g',
				'@nx/angular:application',
				`apps/${product}/web`,
				`--name=${product}-web`,
				'--routing=true',
				'--standalone=true',
				'--strict=true',
				'--style=scss',
				'--bundler=esbuild',
				'--unitTestRunner=vitest-angular',
				'--e2eTestRunner=playwright',
				'--zoneless=false',
				`--port=${port}`,
				`--prefix=${prefix}`,
				`--tags=product:${product},runtime:web,domain:shell,type:app`,
			],
		}),
	),
	...['account', 'hcm', 'console'].map(
		/** Build Nest generator arguments and ownership tags for a product API. */ (product) => ({
			name: `${product}-api`,
			root: `apps/${product}/api`,
			args: [
				'g',
				'@nx/nest:application',
				`apps/${product}/api`,
				`--name=${product}-api`,
				`--tags=product:${product},runtime:api,domain:bootstrap,type:app`,
			],
		}),
	),
]

for (const project of projects) {
	generateProject(project)
}

// Patch API fallback ports after generation. Cloud Run will provide PORT in deployment.
const apiPorts = { account: 4400, console: 4401, hcm: 4402 }
for (const [product, port] of Object.entries(apiPorts)) {
	const file = join('apps', product, 'api', 'src', 'main.ts')
	if (!existsSync(file)) continue

	let source = readFileSync(file, 'utf8')
	source = source.replace(/process\.env\.PORT\s*\|\|\s*3000/g, `process.env.PORT || ${port}`)
	source = source.replace(/process\.env\['PORT'\]\s*\|\|\s*3000/g, `process.env['PORT'] || ${port}`)
	source = source.replace(
		/await app\.listen\(3000\)/g,
		`await app.listen(process.env.PORT || ${port})`,
	)
	writeFileSync(file, source)
}

console.log('\nNx application projects are present and validated.')
