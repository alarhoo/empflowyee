import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { appSlug } from './lib.mjs'

/** Hash reviewed text consistently across Windows and Linux checkouts. */
export function evidenceHash(text) {
	return createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex')
}

/** Resolve only ordinary repository files, rejecting traversal and every symlink component. */
export function evidenceFile(root, relative) {
	if (typeof relative !== 'string' || !/^(docs|libs)\/[A-Za-z0-9._/-]+$/.test(relative))
		throw new Error('Use a repository-relative docs/ or libs/ path')
	const parts = relative.split('/')
	if (
		parts.some(
			/** Reject ambiguous or escaping path segments. */ (part) =>
				!part || part.endsWith('.') || ['.', '..'].includes(part),
		)
	)
		throw new Error('Unsafe evidence path')
	let file = root
	for (const part of parts) {
		file = path.join(file, part)
		if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Symlink evidence is not accepted')
	}
	if (!fs.statSync(file).isFile()) throw new Error('Evidence must be a file')
	return file
}

/** Collect fail-closed readiness diagnostics without modifying source, approvals or metadata. */
export function evaluateReadiness(root, app) {
	const issues = []
	const warnings = []
	const evidence = []
	const base = `docs/hcm/apps/${appSlug(app.appCode)}`
	/** Attach a stable diagnostic and the precise evidence location to repair. */
	function fail(code, at, message) {
		issues.push({ code, at, message })
	}
	/** Require an exact object shape so misspelled evidence fields cannot silently pass. */
	function shape(value, keys, at) {
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			fail('INVALID_SHAPE', at, 'Expected an object')
			return false
		}
		for (const key of keys)
			if (!(key in value)) fail('MISSING_FIELD', `${at}.${key}`, 'Required field is missing')
		for (const key of Object.keys(value))
			if (!keys.includes(key)) fail('UNKNOWN_FIELD', `${at}.${key}`, 'Unknown evidence field')
		return true
	}
	/** Validate nonempty lists while allowing explicitly empty decisions/prerequisites. */
	function list(value, at, allowEmpty = false) {
		if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
			fail('MISSING_LIST', at, 'Expected an explicit evidence list')
			return []
		}
		return value
	}
	/** Reject missing strings rather than coercing incomplete design selections. */
	function text(value, at) {
		if (typeof value !== 'string' || !value.trim()) {
			fail('MISSING_VALUE', at, 'A nonempty value is required')
			return false
		}
		return true
	}
	/** Read bounded repository evidence and report missing/unsafe files without throwing. */
	function read(relative) {
		try {
			const file = evidenceFile(root, relative)
			if (fs.statSync(file).size > 2_000_000) throw new Error('Evidence exceeds size limit')
			return fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n')
		} catch {
			fail(
				'MISSING_OR_UNSAFE_FILE',
				String(relative),
				'Provide an ordinary repository evidence file',
			)
			return null
		}
	}
	/** Parse only evidence objects and preserve diagnostics for malformed JSON. */
	function json(relative) {
		const content = read(relative)
		if (content === null) return null
		try {
			const value = JSON.parse(content)
			if (!value || typeof value !== 'object' || Array.isArray(value))
				throw new Error('Object required')
			return { value, content }
		} catch {
			fail('INVALID_JSON', relative, 'Expected a JSON evidence object')
			return null
		}
	}
	/** Return a deterministic report even when the blueprint has not been authored. */
	function result() {
		return { appCode: app.appCode, ready: issues.length === 0, issues, warnings, evidence }
	}
	for (const [field, expected] of [
		['fddStatus', 'approved'],
		['tddStatus', 'approved'],
		['blockingDecisionStatus', 'clear'],
	])
		if (app[field] !== expected)
			fail('CATALOGUE_NOT_APPROVED', field, `Expected reviewed summary ${expected}`)
	if (typeof app.route !== 'string' || !/^\/[a-z0-9][a-z0-9/-]*$/.test(app.route))
		fail('ROUTE_REQUIRED', 'route', 'Finalize the route in the approved TDD and catalogue')
	if (typeof app.floorplan !== 'string' || !app.floorplan)
		fail('FLOORPLAN_REQUIRED', 'floorplan', 'Finalize the canonical floorplan selection')
	const source = json(`${base}/BLUEPRINT.json`)
	if (!source) return result()
	const blueprint = source.value
	shape(
		blueprint,
		[
			'formatVersion',
			'appCode',
			'domain',
			'documents',
			'route',
			'floorplan',
			'nativeComponents',
			'contracts',
			'data',
			'permissions',
			'projects',
			'prerequisites',
			'foundations',
			'decisions',
			'requirements',
			'tests',
			'traceability',
			'delivery',
		],
		'blueprint',
	)
	if (
		blueprint.formatVersion !== 1 ||
		blueprint.appCode !== app.appCode ||
		blueprint.domain !== app.domain
	)
		fail('IDENTITY_MISMATCH', 'blueprint', 'Format, app and domain must match the canonical entry')
	const approvalSource = json(`${base}/APPROVALS.json`)
	const approvals = new Map()
	if (approvalSource) {
		const ledger = approvalSource.value
		shape(ledger, ['formatVersion', 'appCode', 'approvals'], 'approvals')
		if (ledger.formatVersion !== 1 || ledger.appCode !== app.appCode)
			fail('IDENTITY_MISMATCH', 'approvals', 'Approval ledger identity must match this app')
		for (const approval of list(ledger.approvals, 'approvals.approvals')) {
			if (
				!shape(
					approval,
					['document', 'sha256', 'decision', 'reviewer', 'reviewedAt', 'reviewEvidence'],
					'approval',
				)
			)
				continue
			if (approvals.has(approval.document))
				fail(
					'DUPLICATE_APPROVAL',
					String(approval.document),
					'Keep one current approval per document',
				)
			approvals.set(approval.document, approval)
		}
	}
	/** Bind approvals to reviewed bytes, with human provenance kept explicit and inspectable. */
	function approve(id, relative, content) {
		if (content === null) return
		const sha256 = evidenceHash(content)
		evidence.push({ document: id, path: relative, sha256 })
		const approval = approvals.get(id)
		if (!approval || approval.decision !== 'approved') {
			fail('APPROVAL_REQUIRED', relative, `Record human approval for ${id}`)
			return
		}
		if (approval.sha256 !== sha256)
			fail('STALE_APPROVAL', relative, 'Reviewed content hash differs; review the current revision')
		text(approval.reviewer, `${id}.reviewer`)
		text(approval.reviewEvidence, `${id}.reviewEvidence`)
		if (
			typeof approval.reviewedAt !== 'string' ||
			!/^\d{4}-\d{2}-\d{2}$/.test(approval.reviewedAt) ||
			!Number.isFinite(Date.parse(approval.reviewedAt)) ||
			new Date(approval.reviewedAt).toISOString().slice(0, 10) !== approval.reviewedAt ||
			approval.reviewedAt > new Date().toISOString().slice(0, 10)
		)
			fail('REVIEW_DATE_REQUIRED', relative, 'Use the actual review date in YYYY-MM-DD form')
	}
	approve('BLUEPRINT', `${base}/BLUEPRINT.json`, source.content)
	const documents = new Map()
	const paths = new Set()
	for (const document of list(blueprint.documents, 'documents')) {
		if (!shape(document, ['id', 'kind', 'path'], 'document')) continue
		if (!text(document.id, 'document.id')) continue
		if (
			!/^[A-Za-z][A-Za-z0-9_-]*$/.test(document.id) ||
			![
				'fdd',
				'tdd',
				'traceability',
				'decisions',
				'domain',
				'foundation',
				'contract',
				'ux',
			].includes(document.kind)
		)
			fail('DOCUMENT_IDENTITY', document.id, 'Use a stable document ID and supported evidence kind')
		if (document.id === 'BLUEPRINT' || documents.has(document.id) || paths.has(document.path))
			fail('DUPLICATE_DOCUMENT', document.id, 'Each document needs a unique identity and path')
		paths.add(document.path)
		if (typeof document.path !== 'string' || !/^docs\/(hcm|platform)\/.+\.md$/.test(document.path))
			fail('DOCUMENT_PATH', document.id, 'Reference current HCM/platform Markdown truth')
		const content = read(document.path)
		documents.set(document.id, { ...document, content })
		approve(document.id, document.path, content)
	}
	for (const [kind, filename] of [
		['fdd', 'FDD.md'],
		['tdd', 'TDD.md'],
		['traceability', 'TRACEABILITY.md'],
		['decisions', 'DECISIONS.md'],
	]) {
		const matches = [...documents.values()].filter(
			/** Find this app's required document role. */ (document) => document.kind === kind,
		)
		if (matches.length !== 1 || matches[0].path !== `${base}/${filename}`)
			fail(
				'DOCUMENT_REQUIRED',
				`${base}/${filename}`,
				`Register exactly one current ${kind} document`,
			)
	}
	if (
		![...documents.values()].some(
			/** Require reviewed domain context, not just app designs. */ (document) =>
				document.kind === 'domain',
		)
	)
		fail('DOMAIN_DOCUMENT_REQUIRED', 'documents', 'Reference the owning domain design')
	for (const id of approvals.keys())
		if (id !== 'BLUEPRINT' && !documents.has(id))
			fail('UNKNOWN_APPROVAL', String(id), 'Approval refers to an unregistered document')
	/** Resolve a stable Markdown heading ID or explicit anchor in a registered reviewed document. */
	function reference(ref, at, kinds) {
		if (typeof ref !== 'string' || !/^[A-Za-z0-9_-]+#[A-Za-z0-9_-]+$/.test(ref)) {
			fail('INVALID_REFERENCE', at, 'Use document-id#stable-heading-id')
			return
		}
		const [id, anchor] = ref.split('#')
		if (kinds && !kinds.includes(documents.get(id)?.kind))
			fail('REFERENCE_KIND', at, `Reference a reviewed ${kinds.join('/')} document`)
		const content = documents.get(id)?.content
		const headings = content?.matchAll(/^#{1,6}\s+([A-Za-z0-9_-]+)(?:\s|$)/gm) ?? []
		const found = [...headings].some(
			/** Compare exact stable IDs rather than incidental prose. */ (match) =>
				match[1].toLowerCase() === anchor.toLowerCase(),
		)
		if (!content || (!found && !content.includes(`<a id="${anchor}"></a>`)))
			fail('MISSING_REFERENCE', at, `Missing reviewed heading or anchor ${ref}`)
	}
	if (blueprint.route !== app.route)
		fail('ROUTE_MISMATCH', 'route', 'Blueprint route differs from canonical approved route')
	if (shape(blueprint.floorplan, ['id', 'mode', 'ref'], 'floorplan')) {
		const catalog = read('docs/platform/ux/floorplans/catalog.md')
		if (
			blueprint.floorplan.id !== app.floorplan ||
			!catalog?.includes(`| \`${blueprint.floorplan.id}\``)
		)
			fail(
				'FLOORPLAN_MISMATCH',
				'floorplan.id',
				'Use the canonical platform floorplan ID selected in the catalogue',
			)
		if (!['NATIVE', 'COMPOSED'].includes(blueprint.floorplan.mode))
			fail('FLOORPLAN_MODE', 'floorplan.mode', 'Select NATIVE or COMPOSED')
		reference(blueprint.floorplan.ref, 'floorplan.ref', ['tdd'])
	}
	for (const component of list(blueprint.nativeComponents, 'nativeComponents')) {
		if (!shape(component, ['package', 'version', 'imports', 'ref'], 'nativeComponent')) continue
		if (
			!/^@(?:fundamental-ngx|ui5)\//.test(component.package ?? '') ||
			component.package === '@ui5/webcomponents-ngx'
		)
			fail('UI_STACK', 'nativeComponents', 'Use maintained HCM UI5/Fundamental packages')
		text(component.version, 'nativeComponent.version')
		for (const entry of list(component.imports, 'nativeComponent.imports'))
			text(entry, 'nativeComponent.import')
		reference(component.ref, 'nativeComponent.ref', ['tdd', 'ux'])
	}
	for (const key of ['contracts', 'data', 'permissions'])
		for (const entry of list(blueprint[key], key)) {
			if (!shape(entry, ['id', 'owner', 'ref'], key)) continue
			text(entry.id, `${key}.id`)
			text(entry.owner, `${key}.owner`)
			if (key === 'permissions' && String(entry.id).startsWith('hcm.catalogue.'))
				fail(
					'BUSINESS_PERMISSION_REQUIRED',
					`${key}.id`,
					'Discovery permissions do not authorize business APIs',
				)
			reference(entry.ref, `${key}.ref`)
		}
	for (const prerequisite of list(blueprint.prerequisites, 'prerequisites', true)) {
		if (!shape(prerequisite, ['id', 'state', 'ref'], 'prerequisite')) continue
		text(prerequisite.id, 'prerequisite.id')
		if (prerequisite.state !== 'resolved')
			fail(
				'UNRESOLVED_PREREQUISITE',
				String(prerequisite.id),
				'Resolve the prerequisite contract/design before implementation',
			)
		reference(prerequisite.ref, 'prerequisite.ref')
	}
	const foundations = new Set()
	for (const foundation of list(blueprint.foundations, 'foundations')) {
		if (!shape(foundation, ['id', 'ref'], 'foundation')) continue
		if (foundations.has(foundation.id))
			fail('DUPLICATE_FOUNDATION', String(foundation.id), 'Reference each milestone once')
		foundations.add(foundation.id)
		reference(foundation.ref, 'foundation.ref', ['foundation'])
	}
	for (const id of ['HCM0-01', 'HCM0-02', 'HCM0-03', 'HCM0-04'])
		if (!foundations.has(id))
			fail('FOUNDATION_REQUIRED', id, 'Reference the reviewed prerequisite milestone evidence')
	const declared = new Map()
	for (const decision of list(blueprint.decisions, 'decisions', true)) {
		if (!shape(decision, ['id', 'classification'], 'decision')) continue
		if (declared.has(decision.id))
			fail('DUPLICATE_DECISION', String(decision.id), 'Decision IDs must be unique')
		declared.set(decision.id, decision.classification)
	}
	const actual = new Map()
	for (const document of documents.values()) {
		if (document.kind !== 'decisions') continue
		if (!/^\|\s*ID\s*\|\s*Classification\s*\|/m.test(document.content ?? ''))
			fail(
				'DECISION_REGISTER_REQUIRED',
				document.path,
				'Use the explicit ID | Classification | Decision table, even when empty',
			)
		for (const row of document.content?.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm) ?? []) {
			if (row[1] === 'ID' || /^:?-+:?$/.test(row[1])) continue
			if (!/^DEC-[A-Z0-9-]+$/.test(row[1]))
				fail('INVALID_DECISION_ID', row[1], 'Use stable DEC- identifiers')
			if (actual.has(row[1])) fail('DUPLICATE_DECISION', row[1], 'Decision document repeats an ID')
			actual.set(row[1], row[2])
		}
	}
	for (const id of new Set([...actual.keys(), ...declared.keys()])) {
		const classification = actual.get(id)
		if (!classification || declared.get(id) !== classification)
			fail('DECISION_MISMATCH', id, 'Blueprint and reviewed decision register must match')
		if (!['RESOLVED', 'BLOCKS_THIS_APP', 'BLOCKS_LATER_CAPABILITY'].includes(classification))
			fail('UNREVIEWED_DECISION', id, 'Classify the decision explicitly')
		if (classification === 'BLOCKS_THIS_APP')
			fail(
				'BLOCKS_THIS_APP',
				id,
				'Resolve this decision with the product owner before implementation',
			)
		if (classification === 'BLOCKS_LATER_CAPABILITY')
			warnings.push({
				code: classification,
				at: id,
				message: 'Deferred capability remains outside this app scope',
			})
	}
	const projects = list(blueprint.projects, 'projects')
	const projectRoots = new Set()
	const projectNames = new Set()
	const taxonomy = read('docs/platform/engineering/nx/project-taxonomy.md')
	for (const project of projects) {
		if (!shape(project, ['name', 'root', 'tags'], 'project')) continue
		text(project.name, 'project.name')
		if (projectNames.has(project.name))
			fail('DUPLICATE_PROJECT', String(project.name), 'Project names must be unique')
		projectNames.add(project.name)
		if (projectRoots.has(project.root))
			fail('DUPLICATE_PROJECT', String(project.root), 'Project roots must be unique')
		projectRoots.add(project.root)
		const match =
			typeof project.root === 'string' &&
			project.root.match(/^libs\/hcm\/(web|api|contracts)\/([a-z0-9-]+)(?:\/[a-z0-9-]+)*$/)
		const tags = list(project.tags, 'project.tags')
		if (project.root === app.featurePath && !tags.includes('type:feature'))
			fail(
				'FEATURE_PROJECT_TYPE',
				project.root,
				'The canonical lazy application library must use type:feature',
			)
		if (
			!match ||
			!tags.includes('product:hcm') ||
			!tags.includes(`domain:${match[2]}`) ||
			!tags.includes(`runtime:${match[1] === 'contracts' ? 'universal' : match[1]}`) ||
			!tags.some(
				/** Reject new architectural roles and deployables in a business blueprint. */ (tag) =>
					typeof tag === 'string' &&
					tag !== 'type:app' &&
					/^type:[a-z-]+$/.test(tag) &&
					taxonomy?.includes(`\`${tag}\``),
			) ||
			['product:', 'runtime:', 'domain:', 'type:'].some(
				/** Each architectural dimension has exactly one value. */ (prefix) =>
					tags.filter(
						/** Count only this dimension's tags. */ (tag) =>
							typeof tag === 'string' && tag.startsWith(prefix),
					).length !== 1,
			)
		)
			fail(
				'PROJECT_OWNERSHIP',
				String(project.root),
				'Declare domain-owned HCM roots and matching product/runtime/domain/type tags',
			)
		if (match && fs.existsSync(path.join(root, project.root, 'project.json'))) {
			const existing = json(`${project.root}/project.json`)?.value
			if (
				existing &&
				(existing.name !== project.name ||
					!Array.isArray(existing.tags) ||
					tags.some(
						/** Keep reviewed declarations aligned with materialized Nx projects. */ (tag) =>
							!existing.tags.includes(tag),
					))
			)
				fail(
					'PROJECT_DRIFT',
					project.root,
					'Existing Nx project differs from the reviewed blueprint',
				)
		}
	}
	if (!projectRoots.has(app.featurePath))
		fail(
			'FEATURE_PROJECT_REQUIRED',
			'projects',
			'Include the canonical domain-owned feature project',
		)
	const requirements = list(blueprint.requirements, 'requirements')
	const testIds = new Set()
	for (const test of list(blueprint.tests, 'tests')) {
		if (!shape(test, ['id', 'kind', 'ref'], 'test')) continue
		text(test.id, 'test.id')
		text(test.kind, 'test.kind')
		if (testIds.has(test.id)) fail('DUPLICATE_TEST', String(test.id), 'Test IDs must be unique')
		testIds.add(test.id)
		reference(test.ref, 'test.ref')
	}
	const covered = new Set()
	for (const row of list(blueprint.traceability, 'traceability')) {
		if (!shape(row, ['requirement', 'design', 'tests'], 'traceability')) continue
		if (!requirements.includes(row.requirement))
			fail('UNKNOWN_REQUIREMENT', String(row.requirement), 'Trace only registered requirements')
		covered.add(row.requirement)
		reference(row.design, 'traceability.design', ['tdd'])
		for (const id of list(row.tests, 'traceability.tests'))
			if (!testIds.has(id)) fail('UNKNOWN_TEST', String(id), 'Reference a declared test plan ID')
	}
	for (const requirement of requirements) {
		reference(requirement, 'requirements', ['fdd'])
		if (typeof requirement !== 'string' || !/#REQ-[A-Z0-9-]+$/.test(requirement))
			fail('REQUIREMENT_ID', String(requirement), 'Use a stable FDD REQ- heading ID')
		if (!covered.has(requirement))
			fail('TRACEABILITY_GAP', String(requirement), 'Map this requirement to design and test IDs')
	}
	for (const document of documents.values())
		if (document.kind === 'fdd')
			for (const match of document.content?.matchAll(/^#{1,6}\s+(REQ-[A-Z0-9-]+)(?:\s|$)/gm) ?? [])
				if (!requirements.includes(`${document.id}#${match[1]}`))
					fail('OMITTED_REQUIREMENT', match[1], 'Include every FDD requirement in the blueprint')
	if (shape(blueprint.delivery, ['branch', 'commits'], 'delivery')) {
		if (
			typeof blueprint.delivery.branch !== 'string' ||
			!/^(codex|feat|fix)\/[a-z0-9-]+$/.test(blueprint.delivery.branch)
		)
			fail('BRANCH_REQUIRED', 'delivery.branch', 'Declare the short-lived implementation branch')
		for (const commit of list(blueprint.delivery.commits, 'delivery.commits'))
			text(commit, 'delivery.commit')
	}
	return result()
}
