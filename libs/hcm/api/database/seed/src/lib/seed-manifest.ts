import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export interface SeedModule {
	id: string
	domain: string
	version: number
	dependsOn: string[]
	requiresMigrations: string[]
	apply: string
	reset: string
}

export interface LoadedSeedModule extends SeedModule {
	key: string
	checksum: string
	applySql: string
	resetSql: string
}

const slug = /^[a-z][a-z0-9-]*$/
const moduleId = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/

/** Return a stable, readable development identifier without choosing a future domain's physical key type. */
export function developmentSeedId(domain: string, entity: string, key: string): string {
	if (
		![domain, entity, key].every(
			/** Reject separators and ambiguous identifier components. */ (part) => slug.test(part),
		)
	)
		throw new Error('Invalid stable seed ID')
	return `dunder-mifflin/${domain}/${entity}/${key}`
}

/** Require exactly the declared keys instead of silently ignoring misspelled manifest settings. */
function object(value: unknown, keys: string[]): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Invalid seed manifest object')
	const record = value as Record<string, unknown>
	if (Object.keys(record).sort().join(',') !== [...keys].sort().join(','))
		throw new Error('Unexpected or missing seed manifest fields')
	return record
}

/** Validate and sort a unique list so insignificant JSON ordering does not alter checksums. */
function strings(value: unknown, pattern: RegExp): string[] {
	if (
		!Array.isArray(value) ||
		!value.every(
			/** Check every reference before sorting. */ (entry) =>
				typeof entry === 'string' && pattern.test(entry),
		)
	)
		throw new Error('Invalid seed reference list')
	if (new Set(value).size !== value.length) throw new Error('Duplicate seed reference')
	return [...value].sort()
}

/** Decode reviewed flat files strictly, rejecting symlinks and platform newline differences. */
async function source(directory: string, filename: string): Promise<string> {
	if (!/^[a-z0-9][a-z0-9._-]*\.(sql|json)$/.test(filename)) throw new Error('Unsafe seed filename')
	const path = join(directory, filename)
	if (!(await lstat(path)).isFile()) throw new Error('Seed source must be a regular file')
	const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
		.decode(await readFile(path))
		.replaceAll('\r\n', '\n')
	if (!text.trim() || text.startsWith('\uFEFF') || text.includes('\u0000'))
		throw new Error('Invalid seed source encoding')
	return text
}

/** Expand only strict deterministic ID tokens; authors place these tokens outside SQL quotes. */
function expandIds(sql: string): string {
	const expanded = sql.replace(
		/\{\{id:([^:}]+):([^:}]+):([^}]+)\}\}/g,
		/** Quote a validated identifier whose components cannot contain SQL metacharacters. */ (
			_match,
			domain: string,
			entity: string,
			key: string,
		) => `'${developmentSeedId(domain, entity, key)}'`,
	)
	if (expanded.includes('{{') || expanded.includes('}}')) throw new Error('Invalid seed SQL token')
	return expanded
}

/** Load immutable modules and produce a deterministic topological execution order, including prior versions. */
export async function loadSeedManifest(directory: string): Promise<readonly LoadedSeedModule[]> {
	const manifest = object(JSON.parse(await source(directory, 'manifest.json')), [
		'formatVersion',
		'dataset',
		'modules',
	])
	if (
		manifest['formatVersion'] !== 1 ||
		manifest['dataset'] !== 'dunder-mifflin' ||
		!Array.isArray(manifest['modules'])
	)
		throw new Error('Unsupported seed manifest')
	const modules = new Map<string, LoadedSeedModule>()
	const filenames = new Set(['manifest.json'])
	for (const value of manifest['modules']) {
		const entry = object(value, [
			'id',
			'domain',
			'version',
			'dependsOn',
			'requiresMigrations',
			'apply',
			'reset',
		])
		if (
			typeof entry['id'] !== 'string' ||
			!moduleId.test(entry['id']) ||
			typeof entry['domain'] !== 'string' ||
			!slug.test(entry['domain']) ||
			!Number.isSafeInteger(entry['version']) ||
			Number(entry['version']) < 1 ||
			typeof entry['apply'] !== 'string' ||
			typeof entry['reset'] !== 'string'
		)
			throw new Error('Invalid seed module')
		const module: SeedModule = {
			id: entry['id'],
			domain: entry['domain'],
			version: Number(entry['version']),
			dependsOn: strings(entry['dependsOn'], /^[a-z][a-z0-9.-]*@[1-9][0-9]*$/),
			requiresMigrations: strings(entry['requiresMigrations'], /^\d{6}_[a-z][a-z0-9_]*\.sql$/),
			apply: entry['apply'],
			reset: entry['reset'],
		}
		if (!module.requiresMigrations.length)
			throw new Error('Seed modules must declare migration prerequisites')
		const key = `${module.id}@${module.version}`
		if (modules.has(key)) throw new Error('Duplicate seed module version')
		for (const filename of [module.apply, module.reset]) {
			if (!filename.endsWith('.sql') || filenames.has(filename))
				throw new Error('Seed SQL filenames must be unique')
			filenames.add(filename)
		}
		const applySql = await source(directory, module.apply)
		const resetSql = await source(directory, module.reset)
		const checksum = createHash('sha256')
			.update(
				JSON.stringify({ formatVersion: 1, dataset: 'dunder-mifflin', module, applySql, resetSql }),
			)
			.digest('hex')
		modules.set(key, {
			...module,
			key,
			checksum,
			applySql: expandIds(applySql),
			resetSql: expandIds(resetSql),
		})
	}
	for (const filename of await readdir(directory))
		if (!filenames.has(filename)) throw new Error('Unregistered seed source')
	const ordered: LoadedSeedModule[] = []
	const visiting = new Set<string>()
	const visited = new Set<string>()
	/** Visit prerequisites before a module, rejecting cycles and missing historical versions. */
	function visit(key: string): void {
		if (visited.has(key)) return
		if (visiting.has(key)) throw new Error('Seed dependency cycle')
		const module = modules.get(key)
		if (!module) throw new Error('Missing seed dependency or version')
		visiting.add(key)
		for (const dependency of seedDependencies(module)) visit(dependency)
		visiting.delete(key)
		visited.add(key)
		ordered.push(module)
	}
	for (const key of [...modules.keys()].sort()) visit(key)
	return ordered
}

/** Treat the previous module version as a prerequisite alongside explicit cross-module dependencies. */
export function seedDependencies(module: SeedModule): string[] {
	const dependencies = [...module.dependsOn]
	if (module.version > 1) dependencies.push(`${module.id}@${module.version - 1}`)
	return [...new Set(dependencies)].sort()
}
