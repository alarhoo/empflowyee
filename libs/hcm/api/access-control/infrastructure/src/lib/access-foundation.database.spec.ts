import { beforeAll, afterAll, it, expect } from 'vitest'
import { Client } from 'pg'
import { resolve, join } from 'node:path'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { migrateHcmDatabase, loadSqlMigrations } from '@empflowyee/hcm-api-database-migrations'
import { runDevelopmentSeeds } from '@empflowyee/hcm-api-database-seed'
import {
	HcmRuntimeApplication,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import {
	HcmRuntimeStore,
	createTenantDirectory,
	createSessionReader,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import type { RoleAuditEvent } from '@empflowyee/hcm-api-audit-application'
import {
	HcmAccessDatabase,
	type AuthorizedAccessWork,
} from './hcm-api-access-control-infrastructure'

const tenant = 'local-dunder-mifflin'
const requirement = {
	permission: 'hcm.access-control.roles.manage',
	entitlement: 'hcm.access-control',
}
const env = {
	APP_ENVIRONMENT: 'local',
	NODE_ENV: 'test',
	HCM_LOCAL_TENANTS: 'true',
	HCM_LOCAL_SESSION: 'true',
}
let admin: Client
let runtime: Client
let database: HcmAccessDatabase
let store: HcmRuntimeStore
let david: AuthenticatedHcmContext
let jim: AuthenticatedHcmContext
let temporary: string
let original: unknown[]

/** Allocate only disposable test connections provided by the PostgreSQL harness. */
function connection(role: string): string {
	const value = process.env[`HCM_TEST_${role}`]
	if (!value) throw new Error('Disposable PostgreSQL harness required')
	return value
}
/** Capture stable foundation identities and discovery grants before and after the additive upgrade. */
async function snapshot(): Promise<unknown[]> {
	return (
		await admin.query(`SELECT 'account' AS kind,id AS key FROM hcm.user_account
 UNION ALL SELECT 'role',id FROM hcm.access_role
 UNION ALL SELECT 'grant',role_id || ':' || permission_code FROM hcm.role_permission WHERE permission_code LIKE 'hcm.catalogue.%'
 UNION ALL SELECT 'assignment',id FROM hcm.assignment ORDER BY kind,key`)
	).rows
}
/** Return the authorized identity without executing business writes. */
async function actor(scope: AuthorizedAccessWork) {
	return scope.actor
}
/** Make safe test-only role evidence with no employee content. */
function event(targetId = randomUUID()): RoleAuditEvent {
	return {
		action: 'role.created',
		targetId,
		requestId: randomUUID(),
		summary: { reason: 'Integration verification', changedFields: ['label', 'permissionCodes'] },
	}
}

beforeAll(
	/** Upgrade a populated HCM-0 copy rather than testing only empty-schema installation. */ async () => {
		admin = new Client({ connectionString: connection('MIGRATOR') })
		await admin.connect()
		runtime = new Client({ connectionString: connection('RUNTIME') })
		await runtime.connect()
		await admin.query('DROP SCHEMA IF EXISTS hcm CASCADE')
		temporary = await mkdtemp(join(tmpdir(), 'hcm-access-upgrade-'))
		const inventory = resolve('libs/hcm/api/database/migrations/sql')
		const migrations = await loadSqlMigrations(inventory)
		for (const migration of migrations.slice(0, 5))
			await writeFile(join(temporary, migration.name), migration.sql)
		await migrateHcmDatabase(connection('MIGRATOR'), temporary)
		const source = resolve('libs/hcm/api/database/seed/manifest')
		const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'))
		manifest.modules = manifest.modules.filter(
			/** Reconstruct the immutable pre-business seed inventory. */ (entry: { id: string }) =>
				!['access.business', 'notifications.configuration', 'access.documents'].includes(entry.id),
		)
		const seedDirectory = await mkdtemp(join(tmpdir(), 'hcm-access-seed-'))
		try {
			await writeFile(join(seedDirectory, 'manifest.json'), JSON.stringify(manifest))
			for (const module of manifest.modules)
				for (const file of [module.apply, module.reset])
					await writeFile(join(seedDirectory, file), await readFile(join(source, file)))
			await runDevelopmentSeeds({
				env: { ...env, HCM_SEED_TARGET: tenant, HCM_SEED_DATABASE_URL: connection('MIGRATOR') },
				manifestDirectory: seedDirectory,
				migrations: migrations.slice(0, 5),
			})
		} finally {
			await rm(seedDirectory, { recursive: true, force: true })
		}
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		original = await snapshot()
		expect(await migrateHcmDatabase(connection('MIGRATOR'), inventory)).toEqual([
			'000006_access_audit_foundation.sql',
			'000007_assignment_account_revision.sql',
			'000008_identity_administration.sql',
			'000009_access_reviews.sql',
			'000010_notification_self_service.sql',
			'000011_notification_configuration.sql',
			'000012_notification_rendered_text.sql',
			'000013_document_types.sql',
			'000014_document_template_files.sql',
			'000015_employee_documents.sql',
		])
		await runDevelopmentSeeds({
			env: { ...env, HCM_SEED_TARGET: tenant, HCM_SEED_DATABASE_URL: connection('MIGRATOR') },
			manifestDirectory: source,
			migrations,
		})
		expect(await migrateHcmDatabase(connection('MIGRATOR'), inventory)).toEqual([])
		expect(
			await runDevelopmentSeeds({
				env: { ...env, HCM_SEED_TARGET: tenant, HCM_SEED_DATABASE_URL: connection('MIGRATOR') },
				manifestDirectory: source,
				migrations,
			}),
		).toEqual([])
		database = new HcmAccessDatabase(connection('RUNTIME'))
		store = new HcmRuntimeStore(connection('RUNTIME'))
		const application = new HcmRuntimeApplication(
			createTenantDirectory(env, store),
			createSessionReader(env, store),
		)
		const record = await application.resolveTenant('acme.localhost', '127.0.0.1')
		david = await application.authenticate(record, undefined, {
			tenantId: tenant,
			peerAddress: '127.0.0.1',
			developmentPersona: 'david',
		})
		jim = await application.authenticate(record, undefined, {
			tenantId: tenant,
			peerAddress: '127.0.0.1',
			developmentPersona: 'jim',
		})
		await runtime.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	},
)
afterAll(
	/** Close providers and remove only this suite's allocated temporary inventory. */ async () => {
		await database?.onApplicationShutdown()
		await store?.onApplicationShutdown()
		await runtime?.end()
		await admin?.end()
		if (temporary?.startsWith(join(tmpdir(), 'hcm-access-upgrade-')))
			await rm(temporary, { recursive: true, force: true })
	},
)

it('preserves HCM-0 identities and discovery grants while applying the exact local business register', /** Verify data continuity, persisted system flags and independently count the new permission kind. */ async () => {
	const current = await snapshot()
	expect(current).toEqual(expect.arrayContaining(original))
	expect(current).toHaveLength(original.length + 2)
	expect(current).toContainEqual({
		kind: 'grant',
		key: 'hr-specialist:hcm.catalogue.DOCUMENT_TYPES.discover',
	})
	expect(current).toContainEqual({
		kind: 'grant',
		key: 'hr-specialist:hcm.catalogue.DOCUMENT_TEMPLATES.discover',
	})
	expect(
		(
			await admin.query(
				"SELECT count(*)::int AS count FROM hcm.access_permission WHERE kind='business-operation'",
			)
		).rows[0].count,
	).toBe(39)
	expect((await admin.query('SELECT id FROM hcm.access_role WHERE protected_admin')).rows).toEqual([
		{ id: 'tenant-administrator' },
	])
	expect(
		(await admin.query('SELECT count(*)::int AS count FROM hcm.audit_event')).rows[0].count,
	).toBe(0)
	expect(await database.execute(david, requirement, false, actor)).toMatchObject({
		tenantId: tenant,
		accountId: 'dunder-mifflin/account/david',
	})
	await expect(database.execute(jim, requirement, false, actor)).rejects.toMatchObject({
		code: 'forbidden',
	})
})

it('derives the account from private verified authority and rejects copied contexts', /** Alter the public DTO without gaining a different actor or permission. */ async () => {
	const id = jim.session.user.id
	jim.session.user.id = david.session.user.id
	try {
		await expect(database.execute(jim, requirement, false, actor)).rejects.toMatchObject({
			code: 'forbidden',
		})
	} finally {
		jim.session.user.id = id
	}
	await expect(database.execute({ ...david }, requirement, false, actor)).rejects.toThrow(
		'unauthenticated',
	)
})

it('rechecks disabled accounts, revoked grants and entitlements even with an existing valid session', /** Remove each independent authority source and restore it after the denial. */ async () => {
	await admin.query(
		"UPDATE hcm.user_account SET enabled=false WHERE id='dunder-mifflin/account/david'",
	)
	try {
		await expect(database.execute(david, requirement, false, actor)).rejects.toMatchObject({
			code: 'unauthenticated',
		})
	} finally {
		await admin.query(
			"UPDATE hcm.user_account SET enabled=true WHERE id='dunder-mifflin/account/david'",
		)
	}
	await admin.query(
		"DELETE FROM hcm.role_permission WHERE role_id='tenant-administrator' AND permission_code=$1",
		[requirement.permission],
	)
	try {
		await expect(database.execute(david, requirement, false, actor)).rejects.toMatchObject({
			code: 'forbidden',
		})
	} finally {
		await admin.query('INSERT INTO hcm.role_permission VALUES ($1,$2,$3)', [
			tenant,
			'tenant-administrator',
			requirement.permission,
		])
	}
	await admin.query(
		"UPDATE hcm.tenant_entitlement SET enabled=false WHERE code='hcm.access-control'",
	)
	try {
		await expect(database.execute(david, requirement, false, actor)).rejects.toMatchObject({
			code: 'forbidden',
		})
	} finally {
		await admin.query(
			"UPDATE hcm.tenant_entitlement SET enabled=true WHERE code='hcm.access-control'",
		)
	}
})

it('commits business data and audit together and rolls both back after a later failure', /** Inject failure after append and prove no role or successful evidence survives. */ async () => {
	const id = randomUUID()
	await expect(
		database.execute(
			david,
			requirement,
			true,
			/** Deliberately abort after both writes. */ async (scope) => {
				await scope.transaction
					.insertInto('hcm.access_role')
					.values({
						tenant_id: tenant,
						id,
						label: 'Rollback probe',
						revision: 1,
					})
					.execute()
				await scope.audit.append(event(id))
				throw new Error('injected failure')
			},
		),
	).rejects.toThrow('injected failure')
	expect((await admin.query('SELECT id FROM hcm.access_role WHERE id=$1', [id])).rows).toEqual([])
	expect(
		(await admin.query('SELECT id FROM hcm.audit_event WHERE target_id=$1', [id])).rows,
	).toEqual([])
	const evidence = await database.execute(
		david,
		requirement,
		true,
		/** Append only a fictional test event in this disposable database. */ async (scope) =>
			scope.audit.append(event(id)),
	)
	expect(
		(await admin.query('SELECT actor_account_id FROM hcm.audit_event WHERE id=$1', [evidence]))
			.rows[0].actor_account_id,
	).toBe('dunder-mifflin/account/david')
})

it('fails a business transaction when audit persistence or its safe envelope fails', /** Exercise actual FK failure and rejected arbitrary summary keys. */ async () => {
	await expect(
		database.execute(
			david,
			requirement,
			true,
			/** Add malformed fields that a runtime caller must not persist. */ async (scope) =>
				scope.audit.append({
					...event(),
					summary: { ...event().summary, email: 'secret@example.test' },
				} as RoleAuditEvent),
		),
	).rejects.toThrow('Invalid role audit envelope')
	await expect(
		runtime.query(
			"INSERT INTO hcm.audit_event (tenant_id,id,actor_account_id,action,target_type,target_id,outcome,request_id,category,safe_summary) VALUES ($1,$2,'missing-account','role.created','access-role','test','Succeeded','test','business','{}')",
			[tenant, randomUUID()],
		),
	).rejects.toMatchObject({ code: '23503' })
})

it('enforces runtime immutability of audit, protected flags and permission definitions', /** Direct SQL attempts cannot elevate application privileges or rewrite audit evidence. */ async () => {
	for (const statement of [
		'UPDATE hcm.audit_event SET target_id=target_id',
		'DELETE FROM hcm.audit_event',
		'TRUNCATE hcm.audit_event',
		'UPDATE hcm.access_role SET protected_admin=true',
		'UPDATE hcm.access_role SET system_role=false',
		"INSERT INTO hcm.access_permission VALUES ('local-dunder-mifflin','forged','forged','business-operation')",
		'UPDATE hcm.tenant_entitlement SET enabled=true',
	])
		await expect(runtime.query(statement)).rejects.toMatchObject({ code: '42501' })
})

it('isolates unfiltered audit and roles and rejects foreign tenant writes and associations', /** A second tenant has its own physical rows, not merely an empty query fixture. */ async () => {
	await admin.query("SELECT set_config('hcm.tenant_id','other-tenant',false)")
	try {
		await admin.query(
			"INSERT INTO hcm.tenant (id,slug,display_name,status,defaults) VALUES ('other-tenant','other','Other','active','{}')",
		)
		await admin.query(
			"INSERT INTO hcm.access_role (tenant_id,id,label) VALUES ('other-tenant','foreign-role','Other role')",
		)
	} finally {
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	}
	expect(
		(await runtime.query("SELECT id FROM hcm.access_role WHERE id='foreign-role'")).rows,
	).toEqual([])
	await expect(
		runtime.query(
			"INSERT INTO hcm.access_role (tenant_id,id,label) VALUES ('other-tenant','hostile','Hostile')",
		),
	).rejects.toMatchObject({ code: '42501' })
	await expect(
		runtime.query(
			"INSERT INTO hcm.account_role (tenant_id,account_id,role_id) VALUES ($1,'dunder-mifflin/account/jim','foreign-role')",
			[tenant],
		),
	).rejects.toMatchObject({ code: '23503' })
	await runtime.query("SELECT set_config('hcm.tenant_id','other-tenant',false)")
	expect((await runtime.query('SELECT * FROM hcm.audit_event')).rows).toEqual([])
	await expect(
		runtime.query(
			"INSERT INTO hcm.audit_event (tenant_id,id,actor_account_id,action,target_type,target_id,outcome,request_id,category,safe_summary) VALUES ($1,$2,'dunder-mifflin/account/david','role.created','access-role','test','Succeeded','test','business','{}')",
			[tenant, randomUUID()],
		),
	).rejects.toMatchObject({ code: '42501' })
	await runtime.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
})

it('serializes simultaneous removals so one enabled protected administrator survives', /** Race two independently authorized administrators through the shared transaction lock. */ async () => {
	await admin.query(
		"INSERT INTO hcm.account_role (tenant_id,account_id,role_id) VALUES ($1,'dunder-mifflin/account/jim','tenant-administrator')",
		[tenant],
	)
	try {
		const results = await Promise.allSettled(
			[david, jim].map(
				/** Remove each actor's own protected grant concurrently. */ (context) =>
					database.execute(
						context,
						requirement,
						true,
						/** Enforce the invariant on the post-change state before commit. */ async (scope) => {
							await scope.transaction
								.deleteFrom('hcm.account_role')
								.where('account_id', '=', scope.actor.accountId)
								.where('role_id', '=', 'tenant-administrator')
								.execute()
						},
					),
			),
		)
		expect(
			results.filter(
				/** Count committed removals only. */ (result) => result.status === 'fulfilled',
			),
		).toHaveLength(1)
		expect(
			results.filter(
				/** Exactly one transaction must roll back its removal. */ (result) =>
					result.status === 'rejected',
			),
		).toHaveLength(1)
		expect(
			(
				await admin.query(
					"SELECT count(*)::int AS count FROM hcm.account_role WHERE role_id='tenant-administrator'",
				)
			).rows[0].count,
		).toBe(1)
	} finally {
		await admin.query(
			"INSERT INTO hcm.account_role (tenant_id,account_id,role_id) VALUES ($1,'dunder-mifflin/account/david','tenant-administrator') ON CONFLICT DO NOTHING",
			[tenant],
		)
		await admin.query(
			"DELETE FROM hcm.account_role WHERE account_id='dunder-mifflin/account/jim' AND role_id='tenant-administrator'",
		)
	}
})

it('rolls back a real role insert when the audit store rejects its append', /** Revoke INSERT only in the disposable database and prove the business write cannot commit alone. */ async () => {
	const id = randomUUID()
	await admin.query('REVOKE INSERT ON hcm.audit_event FROM hcm_runtime')
	try {
		await expect(
			database.execute(
				david,
				requirement,
				true,
				/** Reach the audit write after a valid role insert. */ async (scope) => {
					await scope.transaction
						.insertInto('hcm.access_role')
						.values({ tenant_id: tenant, id, label: 'Audit failure probe', revision: 1 })
						.execute()
					await scope.audit.append(event(id))
				},
			),
		).rejects.toMatchObject({ code: '42501' })
		expect((await admin.query('SELECT id FROM hcm.access_role WHERE id=$1', [id])).rows).toEqual([])
	} finally {
		await admin.query('GRANT INSERT ON hcm.audit_event TO hcm_runtime')
	}
})
