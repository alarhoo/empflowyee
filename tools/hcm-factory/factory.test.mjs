import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { catalogue, launchpad, root } from './lib.mjs'

/** Copy the factory into a disposable repository so negative tests cannot mutate current metadata. */
function fixture(t) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hcm-factory-test-'))
	t.after(
		/** Remove only the exact temporary repository created by this fixture. */ () => {
			assert.equal(path.dirname(directory), fs.realpathSync(os.tmpdir()))
			assert.ok(path.basename(directory).startsWith('hcm-factory-test-'))
			fs.rmSync(directory, { recursive: true, force: true })
		},
	)
	fs.cpSync(path.join(root, 'tools/hcm-factory'), path.join(directory, 'tools/hcm-factory'), {
		recursive: true,
	})
	fs.mkdirSync(path.join(directory, 'docs/hcm/catalogue'), { recursive: true })
	writeMetadata(directory, 'hcm-app-catalogue.json', catalogue)
	writeMetadata(directory, 'hcm-launchpad.json', launchpad)
	return directory
}

/** Write test-only catalogue inputs under the isolated fixture repository. */
function writeMetadata(directory, file, value) {
	fs.writeFileSync(path.join(directory, 'docs/hcm/catalogue', file), JSON.stringify(value))
}

/** Invoke a copied CLI from a different working directory to verify module-relative paths. */
function run(directory, script, ...args) {
	return spawnSync(process.execPath, [path.join(directory, 'tools/hcm-factory', script), ...args], {
		cwd: os.tmpdir(),
		encoding: 'utf8',
	})
}

test('materialization validates, preserves existing content and creates no Nx projects', /** Prove dry-run/map-only behavior and repeatable directory-only materialization. */ (t) => {
	const directory = fixture(t)
	assert.equal(run(directory, 'materialize-hcm-structure.mjs', '--dry-run').status, 0)
	assert.equal(fs.existsSync(path.join(directory, 'libs')), false)
	assert.equal(fs.existsSync(path.join(directory, 'docs/hcm/architecture')), false)
	assert.equal(run(directory, 'materialize-hcm-structure.mjs', '--map-only').status, 0)
	assert.equal(fs.existsSync(path.join(directory, 'libs')), false)
	const feature = path.join(directory, catalogue.apps[0].featurePath)
	fs.mkdirSync(feature, { recursive: true })
	fs.writeFileSync(path.join(feature, 'sentinel.txt'), 'preserve existing work')
	assert.equal(run(directory, 'materialize-hcm-structure.mjs').status, 0)
	const map = fs.readFileSync(
		path.join(directory, 'docs/hcm/architecture/HCM-CODEBASE-MAP.generated.md'),
		'utf8',
	)
	assert.equal(run(directory, 'materialize-hcm-structure.mjs').status, 0)
	assert.equal(
		fs.readFileSync(
			path.join(directory, 'docs/hcm/architecture/HCM-CODEBASE-MAP.generated.md'),
			'utf8',
		),
		map,
	)
	assert.equal(
		fs.readFileSync(path.join(feature, 'sentinel.txt'), 'utf8'),
		'preserve existing work',
	)
	for (const app of catalogue.apps)
		assert.ok(fs.statSync(path.join(directory, app.featurePath)).isDirectory())
	assert.deepEqual(
		fs
			.readdirSync(path.join(directory, 'libs'), { recursive: true })
			.filter(
				/** Detect accidental Nx project creation. */ (name) => name.endsWith('project.json'),
			),
		[],
	)
})

test('unsafe paths and provenance are rejected before materialization', /** Fail without creating libraries when metadata can escape domain ownership. */ (t) => {
	const directory = fixture(t)
	const invalid = structuredClone(catalogue)
	invalid.apps[0].featurePath += '/../../../../outside'
	invalid.apps[0].sourcePhase = 'unapproved-reference'
	writeMetadata(directory, 'hcm-app-catalogue.json', invalid)
	const result = run(directory, 'materialize-hcm-structure.mjs')
	assert.equal(result.status, 1)
	assert.match(result.stderr, /invalid featurePath/)
	assert.match(result.stderr, /unsupported catalogue field sourcePhase/)
	assert.equal(fs.existsSync(path.join(directory, 'libs')), false)
})

test('dangling role, catalogue and placement references fail validation', /** Exercise references outside the section-only validation of the supplied tools. */ (t) => {
	const directory = fixture(t)
	const invalid = structuredClone(launchpad)
	invalid.spaces[0].pageIds.push('missing-page')
	invalid.businessRoles[0].catalogueIds.push('missing-catalogue')
	invalid.businessCatalogues[0].appCodes.push('UNKNOWN_APP')
	invalid.pages[0].sections[0].appCodes.pop()
	writeMetadata(directory, 'hcm-launchpad.json', invalid)
	const result = run(directory, 'validate-catalogue.mjs')
	assert.equal(result.status, 1)
	assert.match(result.stderr, /unknown page missing-page/)
	assert.match(result.stderr, /unknown catalogue missing-catalogue/)
	assert.match(result.stderr, /unknown app UNKNOWN_APP/)
	assert.match(result.stderr, /invalid placement/)
})

test('foundation context is deterministic and unknown waves cannot become output paths', /** Distinguish HCM-0 from invalid input and avoid claiming app approval. */ (t) => {
	const directory = fixture(t)
	assert.equal(run(directory, 'wave-context.mjs', '--wave=HCM-0').status, 0)
	const output = path.join(directory, '.tmp/hcm-factory/HCM-0.context.json')
	const first = fs.readFileSync(output, 'utf8')
	const context = JSON.parse(first)
	assert.equal(context.count, 0)
	assert.equal(context.scope, 'engineering-foundation')
	assert.ok(context.documents.includes('docs/hcm/roadmap/HCM-0-WORK-BREAKDOWN.md'))
	assert.equal(run(directory, 'wave-context.mjs', '--wave=HCM-0').status, 0)
	assert.equal(fs.readFileSync(output, 'utf8'), first)
	assert.equal(run(directory, 'wave-context.mjs', '--wave=../../escape').status, 1)
	assert.equal(run(directory, 'wave-context.mjs', '--wave=HCM-99').status, 1)
	assert.equal(run(directory, 'app-context.mjs', '--app=UNKNOWN_APP').status, 1)
	assert.equal(run(directory, 'app-context.mjs', '--app=EMPLOYEE_DIRECTORY').status, 0)
	const app = JSON.parse(
		fs.readFileSync(
			path.join(directory, '.tmp/hcm-factory/EMPLOYEE_DIRECTORY.context.json'),
			'utf8',
		),
	)
	assert.equal(app.gates.fddApproved, false)
	assert.equal(app.gates.fddExists, false)
	assert.equal(app.gates.tddExists, false)
	assert.equal(app.gates.zeroBlockingDecisions, false)
})
