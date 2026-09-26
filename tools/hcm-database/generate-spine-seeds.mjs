import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { format, resolveConfig } from 'prettier'

const directory = resolve('libs/hcm/api/database/seed/manifest')
const tenant = 'local-dunder-mifflin'
// Fictional records belong to explicit seed tooling, never production runtime adapters.
const people = [
	{
		key: 'jim',
		first: 'Jim',
		last: 'Halpert',
		role: 'employee',
		label: 'Employee',
		title: 'Sales Representative',
		site: 'scranton',
	},
	{
		key: 'michael',
		first: 'Michael',
		last: 'Scott',
		role: 'manager',
		label: 'Manager',
		title: 'Regional Manager',
		site: 'scranton',
	},
	{
		key: 'toby',
		first: 'Toby',
		last: 'Flenderson',
		role: 'hr-specialist',
		label: 'HR Operations',
		title: 'HR Representative',
		site: 'scranton',
	},
	{
		key: 'david',
		first: 'David',
		last: 'Wallace',
		role: 'tenant-administrator',
		label: 'Tenant Administrator',
		title: 'Chief Financial Officer',
		site: 'new-york',
	},
]
// Apps admitted after the immutable foundation seed receive discovery through forward modules.
const laterCatalogueApps = new Set(['ORGANIZATION_STRUCTURE'])
const apps = JSON.parse(
	readFileSync('docs/hcm/catalogue/hcm-app-catalogue.json', 'utf8'),
).apps.filter(
	/** Keep the applied foundation projection limited to its original app inventory. */ (app) =>
		!laterCatalogueApps.has(app.appCode),
)
const roles = JSON.parse(
	readFileSync('docs/hcm/catalogue/hcm-launchpad.json', 'utf8'),
).businessRoles
const domains = JSON.parse(
	readFileSync('docs/hcm/catalogue/hcm-domain-catalogue.json', 'utf8'),
).domains

/** Quote trusted seed values safely even when fictional names contain apostrophes. */
function quote(value) {
	return `'${String(value).replaceAll("'", "''")}'`
}
/** Produce stable identity keys independent of insertion order or display labels. */
function id(entity, key) {
	return `dunder-mifflin/${entity}/${key}`
}
/** Write an explicit SQL row with all values quoted and schema/table names fixed by this generator. */
function insert(table, columns, values) {
	return `INSERT INTO hcm.${table} (${columns}) VALUES (${values.map(quote).join(',')});`
}
/** Prefix every module with its owner and explicit transaction-local tenant context. */
function sql(owner, statements) {
	return `-- Ownership: ${owner}. Approved fictional Dunder Mifflin development seed v1.\nPERFORM set_config('hcm.tenant_id', '${tenant}', true);\n${statements.join('\n')}\n`
}
/** Emit a generated artifact or check its normalized content without rewriting applied SQL. */
function emit(filename, content) {
	const file = resolve(directory, filename)
	if (process.argv.includes('--check')) {
		if (readFileSync(file, 'utf8').replaceAll('\r\n', '\n') !== content)
			throw new Error(
				`Seed projection differs: ${filename}; applied versions require forward changes`,
			)
	} else writeFileSync(file, content)
}

emit(
	'runtime.tenant.1.apply.sql',
	sql('runtime', [
		insert('tenant', 'id,slug,display_name,status,defaults', [
			tenant,
			'acme',
			'Dunder Mifflin',
			'active',
			JSON.stringify({
				theme: 'horizon-light',
				language: 'en',
				locale: 'en-US',
				timezone: 'America/New_York',
			}),
		]),
		insert('tenant_hostname', 'hostname,tenant_id', ['acme.localhost', tenant]),
	]),
)
emit(
	'runtime.tenant.1.reset.sql',
	sql('runtime', [
		`DELETE FROM hcm.tenant_hostname WHERE tenant_id=${quote(tenant)} AND hostname='acme.localhost';`,
		`DELETE FROM hcm.tenant WHERE id=${quote(tenant)};`,
	]),
)

const workforce = [
	insert('organisation', 'tenant_id,id,code,name', [
		tenant,
		id('organisation', 'company'),
		'DM',
		'Dunder Mifflin',
	]),
]
for (const [site, name, city] of [
	['scranton', 'Scranton Branch', 'Scranton'],
	['new-york', 'New York Headquarters', 'New York'],
]) {
	workforce.push(
		insert('organisation', 'tenant_id,id,code,name,parent_id', [
			tenant,
			id('organisation', site),
			site,
			name,
			id('organisation', 'company'),
		]),
	)
	workforce.push(
		insert('location', 'tenant_id,id,organisation_id,name,city,country_code,timezone', [
			tenant,
			id('location', site),
			id('organisation', site),
			name,
			city,
			'US',
			'America/New_York',
		]),
	)
}
for (const person of people) {
	workforce.push(
		insert('person', 'tenant_id,id,given_name,family_name,display_name', [
			tenant,
			id('person', person.key),
			person.first,
			person.last,
			`${person.first} ${person.last}`,
		]),
	)
	workforce.push(
		insert('worker', 'tenant_id,id,person_id,worker_code', [
			tenant,
			id('worker', person.key),
			id('person', person.key),
			`DM-${person.key.toUpperCase()}`,
		]),
	)
	workforce.push(
		insert('employment', 'tenant_id,id,worker_id,organisation_id', [
			tenant,
			id('employment', person.key),
			id('worker', person.key),
			id('organisation', 'company'),
		]),
	)
	workforce.push(
		insert('assignment', 'tenant_id,id,employment_id,organisation_id,location_id,job_title', [
			tenant,
			id('assignment', person.key),
			id('employment', person.key),
			id('organisation', person.site),
			id('location', person.site),
			person.title,
		]),
	)
}
emit('workforce.foundation.1.apply.sql', sql('workforce-foundation', workforce))
const workforceReset = []
for (const table of ['assignment', 'employment', 'worker', 'person'])
	workforceReset.push(
		`DELETE FROM hcm.${table} WHERE tenant_id=${quote(tenant)} AND id IN (${people.map(/** Match only this version's managed identities. */ (person) => quote(id(table, person.key))).join(',')});`,
	)
workforceReset.push(
	`DELETE FROM hcm.location WHERE tenant_id=${quote(tenant)} AND id IN (${quote(id('location', 'scranton'))},${quote(id('location', 'new-york'))});`,
)
workforceReset.push(
	`DELETE FROM hcm.organisation WHERE tenant_id=${quote(tenant)} AND id IN (${quote(id('organisation', 'scranton'))},${quote(id('organisation', 'new-york'))});`,
)
workforceReset.push(
	`DELETE FROM hcm.organisation WHERE tenant_id=${quote(tenant)} AND id=${quote(id('organisation', 'company'))};`,
)
emit('workforce.foundation.1.reset.sql', sql('workforce-foundation', workforceReset))

const accounts = []
for (const [index, person] of people.entries()) {
	accounts.push(
		insert('user_account', 'tenant_id,id,person_id,email', [
			tenant,
			id('account', person.key),
			id('person', person.key),
			`${person.first}.${person.last}@dundermifflin.example`.toLowerCase(),
		]),
	)
	accounts.push(
		insert(
			'development_persona',
			'tenant_id,persona_key,account_id,role_label,sort_order,is_default',
			[tenant, person.key, id('account', person.key), person.label, index, index === 0],
		),
	)
}
emit('identity.accounts.1.apply.sql', sql('identity-access', accounts))
emit(
	'identity.accounts.1.reset.sql',
	sql('identity-access', [
		`DELETE FROM hcm.development_persona WHERE tenant_id=${quote(tenant)} AND persona_key IN (${people.map(/** Restrict reset to the four declared selectors. */ (person) => quote(person.key)).join(',')});`,
		`DELETE FROM hcm.user_account WHERE tenant_id=${quote(tenant)} AND id IN (${people.map(/** Restrict reset to the four seeded accounts. */ (person) => quote(id('account', person.key))).join(',')});`,
	]),
)
const access = []
for (const domain of domains) {
	access.push(
		insert('entitlement_definition', 'code,domain', [
			`hcm.${domain.domain}`,
			domain.domain,
		]).replace(/;$/, ' ON CONFLICT (code) DO NOTHING;'),
	)
	access.push(insert('tenant_entitlement', 'tenant_id,code', [tenant, `hcm.${domain.domain}`]))
}
for (const app of apps)
	access.push(
		insert('access_permission', 'tenant_id,code,description,kind', [
			tenant,
			app.discoveryPolicy.permission,
			app.title,
			'catalogue-discovery',
		]),
	)
for (const person of people) {
	const role = roles.find(
		/** Resolve the established persona role from current canonical metadata. */ (entry) =>
			entry.roleId === person.role,
	)
	if (!role) throw new Error(`Missing canonical role: ${person.role}`)
	access.push(insert('access_role', 'tenant_id,id,label', [tenant, person.role, person.label]))
	access.push(
		insert('account_role', 'tenant_id,account_id,role_id', [
			tenant,
			id('account', person.key),
			person.role,
		]),
	)
	// Reviewed additions are delivered by immutable forward modules, never rewritten into foundation v1.
	for (const app of apps)
		if (
			!(
				(person.role === 'hr-specialist' &&
					[
						'DOCUMENT_TYPES',
						'DOCUMENT_TEMPLATES',
						'IDENTIFICATION_TYPES',
						'LOOKUP_VALUES',
					].includes(app.appCode)) ||
				(person.role === 'tenant-administrator' &&
					app.appCode === 'EMPLOYEE_PROFILE_CONFIGURATION') ||
				(app.appCode === 'DOCUMENT_REQUESTS' && person.role !== 'hr-specialist')
			) &&
			app.catalogueIds.some(
				/** Persist discovery grants only for canonical catalogue memberships. */ (catalogue) =>
					role.catalogueIds.includes(catalogue),
			)
		)
			access.push(
				insert('role_permission', 'tenant_id,role_id,permission_code', [
					tenant,
					person.role,
					app.discoveryPolicy.permission,
				]),
			)
}
emit('access.discovery.1.apply.sql', sql('access-control', access))
const roleIds = people
	.map(/** Identify only roles managed by this version. */ (person) => quote(person.role))
	.join(',')
const permissions = apps
	.map(
		/** Identify only permissions in this seed projection. */ (app) =>
			quote(app.discoveryPolicy.permission),
	)
	.join(',')
const entitlements = domains
	.map(
		/** Identify only declared catalogue entitlements. */ (domain) => quote(`hcm.${domain.domain}`),
	)
	.join(',')
emit(
	'access.discovery.1.reset.sql',
	sql('access-control', [
		`DELETE FROM hcm.account_role WHERE tenant_id=${quote(tenant)} AND role_id IN (${roleIds}) AND account_id IN (${people.map(/** Limit reset to seeded account grants. */ (person) => quote(id('account', person.key))).join(',')});`,
		`DELETE FROM hcm.role_permission WHERE tenant_id=${quote(tenant)} AND role_id IN (${roleIds}) AND permission_code IN (${permissions});`,
		`DELETE FROM hcm.access_role WHERE tenant_id=${quote(tenant)} AND id IN (${roleIds});`,
		`DELETE FROM hcm.access_permission WHERE tenant_id=${quote(tenant)} AND code IN (${permissions});`,
		`DELETE FROM hcm.tenant_entitlement WHERE tenant_id=${quote(tenant)} AND code IN (${entitlements});`,
		// Global metadata can serve other tenants; leave definitions in place on a local dataset reset.
	]),
)
const definitions = [
	['runtime.tenant', 'runtime', [], ['000003_runtime_tenant_projection.sql']],
	[
		'workforce.foundation',
		'workforce-foundation',
		['runtime.tenant@1'],
		['000004_workforce_identity_spine.sql'],
	],
	[
		'identity.accounts',
		'identity-access',
		['workforce.foundation@1'],
		['000005_identity_access_spine.sql'],
	],
	[
		'access.discovery',
		'access-control',
		['identity.accounts@1'],
		['000005_identity_access_spine.sql'],
	],
]
const manifest = {
	formatVersion: 1,
	dataset: 'dunder-mifflin',
	modules: definitions.map(
		/** Register domain ownership, immutable dependencies and exact SQL prerequisites. */ ([
			id,
			domain,
			dependsOn,
			requiresMigrations,
		]) => ({
			id,
			domain,
			version: 1,
			dependsOn,
			requiresMigrations,
			apply: `${id}.1.apply.sql`,
			reset: `${id}.1.reset.sql`,
		}),
	),
}
// This generator owns only the four immutable HCM-0 modules. Keep later domain
// modules registered when checking or regenerating the foundation projection.
const registered = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'))
manifest.modules.push(
	...registered.modules.filter(
		/** Preserve forward modules without regenerating their independently owned SQL. */ (module) =>
			!definitions.some(
				/** Match only the exact foundation version owned by this generator. */ ([id]) =>
					module.id === id && module.version === 1,
			),
	),
)
emit(
	'manifest.json',
	await format(JSON.stringify(manifest), {
		...(await resolveConfig(resolve(directory, 'manifest.json'))),
		parser: 'json',
		endOfLine: 'lf',
	}),
)
console.log('Dunder Mifflin spine seed projection is current.')
