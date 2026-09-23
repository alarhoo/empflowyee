import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { getApp, root } from './lib.mjs'
import { evidenceFile, evidenceHash, evaluateReadiness } from './readiness.mjs'

const base = 'docs/hcm/apps/employee-directory'

test('evidence paths reject junctions and Windows alternate streams', /** Do not let apparently local references bypass the ordinary-file policy. */ (t) => {
	const data = fixture(t)
	const alias = path.join(data.directory, 'docs/hcm/domains/linked')
	fs.symlinkSync(path.join(data.directory, 'docs/hcm/domains/employee'), alias, 'junction')
	assert.throws(
		/** Follow a forbidden linked component in a controlled fixture. */ () =>
			evidenceFile(data.directory, 'docs/hcm/domains/linked/README.md'),
		/Symlink/,
	)
	assert.throws(
		/** Reject NTFS alternate data stream syntax before reading anything. */ () =>
			evidenceFile(data.directory, `${base}/FDD.md:stream.md`),
		/repository-relative/,
	)
})

test('review identity, dates and decision table structure are explicit evidence', /** Reject incomplete human review records and unindexed decision formats. */ (t) => {
	const data = fixture(t)
	const file = path.join(data.directory, `${base}/APPROVALS.json`)
	const ledger = JSON.parse(fs.readFileSync(file, 'utf8'))
	ledger.approvals[0].reviewer = ''
	ledger.approvals[0].reviewedAt = '2026-02-30'
	write(data.directory, `${base}/APPROVALS.json`, ledger)
	assert.ok(codes(data).includes('MISSING_VALUE'))
	assert.ok(codes(data).includes('REVIEW_DATE_REQUIRED'))
	write(data.directory, `${base}/DECISIONS.md`, '# Unstructured decisions\nNeeds review\n')
	review(data)
	assert.ok(codes(data).includes('DECISION_REGISTER_REQUIRED'))
})

test('business grants and materialized project tags cannot use weaker substitutes', /** Discovery-only permissions and project drift must not pass an implementation gate. */ (t) => {
	const data = fixture(t)
	data.blueprint.permissions[0].id = 'hcm.catalogue.EMPLOYEE_DIRECTORY.discover'
	data.blueprint.projects[0].tags[3] = 'type:ui'
	data.blueprint.foundations[0].ref = 'TDD#DESIGN-DIRECTORY-1'
	write(data.directory, `${data.app.featurePath}/project.json`, { name: 'wrong-project', tags: [] })
	review(data)
	for (const code of [
		'BUSINESS_PERMISSION_REQUIRED',
		'REFERENCE_KIND',
		'PROJECT_DRIFT',
		'FEATURE_PROJECT_TYPE',
	])
		assert.ok(codes(data).includes(code), code)
})

/** Write a test-owned evidence file under an isolated temporary repository. */
function write(directory, relative, value) {
	const file = path.join(directory, relative)
	fs.mkdirSync(path.dirname(file), { recursive: true })
	fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2))
}

/** Create synthetic reviewed evidence; this helper is never used against real app documents. */
function review(fixture) {
	write(fixture.directory, `${base}/BLUEPRINT.json`, fixture.blueprint)
	const documents = [
		{ id: 'BLUEPRINT', path: `${base}/BLUEPRINT.json` },
		...fixture.blueprint.documents,
	]
	write(fixture.directory, `${base}/APPROVALS.json`, {
		formatVersion: 1,
		appCode: fixture.app.appCode,
		approvals: documents.map(
			/** Pin the synthetic review to each exact fixture document revision. */ (document) => ({
				document: document.id,
				sha256: evidenceHash(fs.readFileSync(path.join(fixture.directory, document.path), 'utf8')),
				decision: 'approved',
				reviewer: 'Synthetic test reviewer',
				reviewedAt: '2026-09-23',
				reviewEvidence: 'Isolated automated test fixture; not a real product approval',
			}),
		),
	})
}

/** Build a complete passing fixture without granting approval to any canonical business app. */
function fixture(t) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hcm-readiness-'))
	t.after(
		/** Delete only this test's verified temporary workspace. */ () => {
			assert.equal(path.dirname(directory), fs.realpathSync(os.tmpdir()))
			assert.ok(path.basename(directory).startsWith('hcm-readiness-'))
			fs.rmSync(directory, { recursive: true, force: true })
		},
	)
	const app = {
		...structuredClone(getApp('EMPLOYEE_DIRECTORY')),
		fddStatus: 'approved',
		tddStatus: 'approved',
		blockingDecisionStatus: 'clear',
		route: '/employee-directory',
		floorplan: 'UX-FP-LIST-REPORT',
	}
	const documents = [
		{ id: 'FDD', kind: 'fdd', path: `${base}/FDD.md` },
		{ id: 'TDD', kind: 'tdd', path: `${base}/TDD.md` },
		{ id: 'TRACE', kind: 'traceability', path: `${base}/TRACEABILITY.md` },
		{ id: 'DECISIONS', kind: 'decisions', path: `${base}/DECISIONS.md` },
		{ id: 'DOMAIN', kind: 'domain', path: 'docs/hcm/domains/employee/README.md' },
		{ id: 'FOUNDATION', kind: 'foundation', path: 'docs/hcm/testing/synthetic-foundation.md' },
	]
	for (const document of documents)
		write(directory, document.path, '# Synthetic reviewed document\n')
	write(
		directory,
		`${base}/DECISIONS.md`,
		'# Decisions\n\n| ID | Classification | Decision |\n| --- | --- | --- |\n',
	)
	write(
		directory,
		'docs/platform/engineering/nx/project-taxonomy.md',
		fs.readFileSync(path.join(root, 'docs/platform/engineering/nx/project-taxonomy.md'), 'utf8'),
	)
	write(
		directory,
		documents[0].path,
		'# Synthetic FDD\n\n## REQ-DIRECTORY-1\nRead the directory.\n',
	)
	write(
		directory,
		documents[1].path,
		'# Synthetic TDD\n\n## DESIGN-DIRECTORY-1\nDomain contract and persistence design.\n\n## TEST-DIRECTORY-1\nTenant-isolation and access scenarios.\n',
	)
	write(
		directory,
		documents[4].path,
		'# Synthetic domain\n\n## CONTRACT-DIRECTORY\nReviewed contract.\n',
	)
	write(
		directory,
		documents[5].path,
		'# Synthetic foundations\n\n## HCM0-01\nVerified\n## HCM0-02\nVerified\n## HCM0-03\nVerified\n## HCM0-04\nVerified\n',
	)
	write(
		directory,
		'docs/platform/ux/floorplans/catalog.md',
		fs.readFileSync(path.join(root, 'docs/platform/ux/floorplans/catalog.md'), 'utf8'),
	)
	const blueprint = {
		formatVersion: 1,
		appCode: app.appCode,
		domain: app.domain,
		documents,
		route: app.route,
		floorplan: { id: app.floorplan, mode: 'COMPOSED', ref: 'TDD#DESIGN-DIRECTORY-1' },
		nativeComponents: [
			{
				package: '@fundamental-ngx/core',
				version: '0.64.3',
				imports: ['DynamicPageModule'],
				ref: 'TDD#DESIGN-DIRECTORY-1',
			},
		],
		contracts: [{ id: 'DirectoryQuery', owner: 'employee', ref: 'DOMAIN#CONTRACT-DIRECTORY' }],
		data: [{ id: 'person-directory-read-model', owner: 'employee', ref: 'TDD#DESIGN-DIRECTORY-1' }],
		permissions: [
			{ id: 'hcm.employee.directory.read', owner: 'employee', ref: 'TDD#DESIGN-DIRECTORY-1' },
		],
		projects: [
			{
				name: 'hcm-web-employee-feature-employee-directory',
				root: app.featurePath,
				tags: ['product:hcm', 'runtime:web', 'domain:employee', 'type:feature'],
			},
		],
		prerequisites: [
			{ id: 'directory-contract', state: 'resolved', ref: 'DOMAIN#CONTRACT-DIRECTORY' },
		],
		foundations: ['HCM0-01', 'HCM0-02', 'HCM0-03', 'HCM0-04'].map(
			/** Cite independent prerequisite evidence anchors. */ (id) => ({
				id,
				ref: `FOUNDATION#${id}`,
			}),
		),
		decisions: [],
		requirements: ['FDD#REQ-DIRECTORY-1'],
		tests: [{ id: 'TEST-DIRECTORY-1', kind: 'integration', ref: 'TDD#TEST-DIRECTORY-1' }],
		traceability: [
			{
				requirement: 'FDD#REQ-DIRECTORY-1',
				design: 'TDD#DESIGN-DIRECTORY-1',
				tests: ['TEST-DIRECTORY-1'],
			},
		],
		delivery: {
			branch: 'codex/hcm-employee-directory',
			commits: ['feat(hcm-employee): add approved directory slice'],
		},
	}
	const result = { directory, app, blueprint }
	review(result)
	return result
}

/** Evaluate current fixture evidence and return machine-readable diagnostic codes. */
function codes(fixture) {
	return evaluateReadiness(fixture.directory, fixture.app).issues.map(
		/** Extract stable failure codes for assertions. */ (issue) => issue.code,
	)
}

test('complete reviewed synthetic evidence passes deterministically without writes', /** Prove a positive gate and byte-for-byte read-only behavior. */ (t) => {
	const data = fixture(t)
	const files = [
		...data.blueprint.documents.map(
			/** Include every reviewed source. */ (document) => document.path,
		),
		`${base}/BLUEPRINT.json`,
		`${base}/APPROVALS.json`,
	]
	const before = files.map(
		/** Snapshot original evidence bytes. */ (file) =>
			fs.readFileSync(path.join(data.directory, file), 'utf8'),
	)
	const first = evaluateReadiness(data.directory, data.app)
	assert.equal(first.ready, true, JSON.stringify(first.issues))
	assert.deepEqual(evaluateReadiness(data.directory, data.app), first)
	assert.deepEqual(
		files.map(
			/** Confirm no approval or source mutations. */ (file) =>
				fs.readFileSync(path.join(data.directory, file), 'utf8'),
		),
		before,
	)
	assert.equal(evidenceHash('review\r\n'), evidenceHash('review\n'))
})

test('catalogue flags alone and missing or malformed evidence never approve an app', /** Exercise fail-closed paths for absent documents and invalid JSON/shape. */ (t) => {
	const data = fixture(t)
	fs.unlinkSync(path.join(data.directory, `${base}/APPROVALS.json`))
	assert.ok(codes(data).includes('APPROVAL_REQUIRED'))
	review(data)
	fs.unlinkSync(path.join(data.directory, `${base}/FDD.md`))
	assert.ok(codes(data).includes('MISSING_OR_UNSAFE_FILE'))
	write(data.directory, `${base}/BLUEPRINT.json`, '{bad json')
	assert.ok(codes(data).includes('INVALID_JSON'))
	write(data.directory, `${base}/BLUEPRINT.json`, '{}')
	assert.ok(codes(data).includes('MISSING_FIELD'))
	fs.unlinkSync(path.join(data.directory, `${base}/BLUEPRINT.json`))
	assert.equal(evaluateReadiness(data.directory, data.app).ready, false)
})

test('document changes, blueprint changes and stale catalogue summaries revoke readiness', /** Require review of the actual revision, not cached flags or hashes. */ (t) => {
	const data = fixture(t)
	fs.appendFileSync(path.join(data.directory, `${base}/FDD.md`), '\nChanged requirement\n')
	assert.ok(codes(data).includes('STALE_APPROVAL'))
	review(data)
	data.blueprint.delivery.commits.push('test(hcm-employee): verify isolation')
	write(data.directory, `${base}/BLUEPRINT.json`, data.blueprint)
	assert.ok(codes(data).includes('STALE_APPROVAL'))
	review(data)
	data.app.fddStatus = 'not-finalized'
	assert.ok(codes(data).includes('CATALOGUE_NOT_APPROVED'))
})

test('omitted blockers fail and deferred capabilities remain visible without blocking', /** Compare the reviewed decision register with the blueprint, including unreviewed classifications. */ (t) => {
	const data = fixture(t)
	write(
		data.directory,
		`${base}/DECISIONS.md`,
		'# Decisions\n\n| ID | Classification | Decision |\n| DEC-001 | BLOCKS_THIS_APP | Needs a product decision |\n',
	)
	review(data)
	assert.ok(codes(data).includes('DECISION_MISMATCH'))
	assert.ok(codes(data).includes('BLOCKS_THIS_APP'))
	data.blueprint.decisions = [{ id: 'DEC-001', classification: 'BLOCKS_LATER_CAPABILITY' }]
	write(
		data.directory,
		`${base}/DECISIONS.md`,
		'# Decisions\n\n| ID | Classification | Decision |\n| DEC-001 | BLOCKS_LATER_CAPABILITY | Deferred |\n',
	)
	review(data)
	const deferred = evaluateReadiness(data.directory, data.app)
	assert.equal(deferred.ready, true, JSON.stringify(deferred.issues))
	assert.equal(deferred.warnings[0].code, 'BLOCKS_LATER_CAPABILITY')
	write(
		data.directory,
		`${base}/DECISIONS.md`,
		'# Decisions\n\n| ID | Classification | Decision |\n| DEC-001 | UNKNOWN | Unreviewed |\n',
	)
	review(data)
	assert.ok(codes(data).includes('UNREVIEWED_DECISION'))
})

test('missing selections, unresolved contracts, traceability and domain ownership deny readiness', /** Reject incomplete implementation inputs even after synthetic document approval. */ (t) => {
	const data = fixture(t)
	data.app.route = null
	data.app.floorplan = null
	data.blueprint.floorplan.mode = 'CUSTOM'
	data.blueprint.prerequisites[0].state = 'open'
	data.blueprint.traceability = []
	data.blueprint.projects[0].root = 'libs/hcm/web/employee-space/feature-employee-directory'
	data.blueprint.contracts[0].ref = 'DOMAIN#MISSING'
	data.blueprint.foundations.pop()
	review(data)
	const failures = codes(data)
	for (const code of [
		'ROUTE_REQUIRED',
		'FLOORPLAN_REQUIRED',
		'FLOORPLAN_MODE',
		'UNRESOLVED_PREREQUISITE',
		'TRACEABILITY_GAP',
		'PROJECT_OWNERSHIP',
		'FEATURE_PROJECT_REQUIRED',
		'MISSING_REFERENCE',
		'FOUNDATION_REQUIRED',
	])
		assert.ok(failures.includes(code), code)
})

test('every FDD requirement and declared test must have a valid traceability relationship', /** Detect omitted requirements and unknown tests that otherwise look like complete traceability. */ (t) => {
	const data = fixture(t)
	fs.appendFileSync(
		path.join(data.directory, `${base}/FDD.md`),
		'\n## REQ-DIRECTORY-2\nAnother requirement\n',
	)
	data.blueprint.traceability[0].tests = ['UNKNOWN']
	review(data)
	assert.ok(codes(data).includes('OMITTED_REQUIREMENT'))
	assert.ok(codes(data).includes('UNKNOWN_TEST'))
})

test('unsafe paths, duplicate documents and unknown fields fail closed', /** Keep evidence in the repository and detect ambiguous or misspelled records. */ (t) => {
	const data = fixture(t)
	data.blueprint.documents.push({ id: 'FDD', kind: 'fdd', path: 'docs/../outside.md' })
	data.blueprint.fakeApproval = true
	write(data.directory, `${base}/BLUEPRINT.json`, data.blueprint)
	const failures = codes(data)
	assert.ok(failures.includes('DUPLICATE_DOCUMENT'))
	assert.ok(failures.includes('MISSING_OR_UNSAFE_FILE'))
	assert.ok(failures.includes('UNKNOWN_FIELD'))
})

test('CLI scopes, exit codes and CI admission checks preserve planned catalogue state', /** Exercise real tools from another cwd while using only an isolated catalogue and evidence. */ (t) => {
	const data = fixture(t)
	fs.cpSync(path.join(root, 'tools/hcm-factory'), path.join(data.directory, 'tools/hcm-factory'), {
		recursive: true,
	})
	write(data.directory, 'docs/hcm/catalogue/hcm-app-catalogue.json', { apps: [data.app] })
	write(data.directory, 'docs/hcm/catalogue/hcm-launchpad.json', {})
	/** Execute the copied CLI without depending on the working directory. */
	function run(script, ...args) {
		return spawnSync(
			process.execPath,
			[path.join(data.directory, 'tools/hcm-factory', script), ...args],
			{ cwd: os.tmpdir(), encoding: 'utf8' },
		)
	}
	assert.equal(run('check-readiness.mjs', '--app=EMPLOYEE_DIRECTORY', '--check').status, 0)
	assert.equal(run('check-readiness.mjs', '--admitted', '--check').status, 0)
	assert.equal(run('check-readiness.mjs', '--app=UNKNOWN', '--check').status, 2)
	assert.equal(run('check-readiness.mjs', '--wave=HCM-0', '--check').status, 2)
	assert.equal(run('check-readiness.mjs', '--all', '--chek').status, 2)
	assert.equal(run('app-context.mjs', '--app=EMPLOYEE_DIRECTORY', '--check').status, 0)
	write(data.directory, `${base}/APPROVALS.json`, {
		formatVersion: 1,
		appCode: data.app.appCode,
		approvals: [],
	})
	assert.equal(run('check-readiness.mjs', '--admitted', '--check').status, 1)
	assert.equal(run('app-context.mjs', '--app=EMPLOYEE_DIRECTORY').status, 0)
	assert.equal(run('app-context.mjs', '--app=EMPLOYEE_DIRECTORY', '--check').status, 1)
	assert.equal(run('wave-context.mjs', '--wave=HCM-2', '--check').status, 1)
	assert.equal(run('wave-context.mjs', '--wave=HCM-0', '--check').status, 2)
	data.app.fddStatus = 'not-finalized'
	data.app.tddStatus = 'not-finalized'
	write(data.directory, 'docs/hcm/catalogue/hcm-app-catalogue.json', { apps: [data.app] })
	assert.equal(JSON.parse(run('check-readiness.mjs', '--admitted', '--check').stdout).checked, 0)
	write(data.directory, `${data.app.featurePath}/project.json`, { name: 'synthetic-feature' })
	assert.equal(run('check-readiness.mjs', '--admitted', '--check').status, 1)
})
