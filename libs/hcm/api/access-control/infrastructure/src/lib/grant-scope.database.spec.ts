import { beforeAll, afterAll, it, expect } from 'vitest'
import { Client } from 'pg'
import { resolve } from 'node:path'
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
import {
	grantCoversSubject,
	type HcmScopeSubject,
} from '@empflowyee/hcm-api-access-control-application'
import {
	HcmAccessDatabase,
	type AuthorizedAccessWork,
} from './hcm-api-access-control-infrastructure'

const tenant = 'local-dunder-mifflin'
const permission = 'hcm.access-control.roles.manage'
const jimEmployment = 'dunder-mifflin/employment/jim'
const pamEmployment = 'dunder-mifflin/employment/pam'
const environment = {
	APP_ENVIRONMENT: 'local',
	NODE_ENV: 'test',
	HCM_LOCAL_TENANTS: 'true',
	HCM_LOCAL_SESSION: 'true',
}
let admin: Client
let runtime: Client
let database: HcmAccessDatabase
let store: HcmRuntimeStore
let context: AuthenticatedHcmContext
let departments: string[]

/** Read only the disposable harness connection, never the developer database. */
function connection(role: string): string {
	const value = process.env[`HCM_TEST_${role}`]
	if (!value) throw new Error('Disposable PostgreSQL harness required')
	return value
}

/** Return the verified grant evidence without executing a business mutation. */
async function actor(scope: AuthorizedAccessWork) {
	return scope.actor
}

/** Exercise the real transactional policy using source-resolved test workforce facts. */
function authorize(subject?: HcmScopeSubject) {
	return database.execute(
		context,
		{ permission, entitlement: 'hcm.access-control', subject },
		false,
		actor,
	)
}

beforeAll(
	/** Populate the isolated migrated database and two independently constrained grants. */ async () => {
		admin = new Client({ connectionString: connection('MIGRATOR') })
		runtime = new Client({ connectionString: connection('RUNTIME') })
		await admin.connect()
		await runtime.connect()
		await admin.query('DROP SCHEMA IF EXISTS hcm CASCADE')
		const inventory = resolve('libs/hcm/api/database/migrations/sql')
		await migrateHcmDatabase(connection('MIGRATOR'), inventory)
		await runDevelopmentSeeds({
			env: {
				...environment,
				HCM_SEED_TARGET: tenant,
				HCM_SEED_DATABASE_URL: connection('MIGRATOR'),
			},
			manifestDirectory: resolve('libs/hcm/api/database/seed/manifest'),
			migrations: await loadSqlMigrations(inventory),
		})
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		await runtime.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		departments = (await admin.query('SELECT id FROM hcm.department ORDER BY id LIMIT 2')).rows.map(
			/** Pick distinct existing tenant-owned departments for intersecting scopes. */ (row) =>
				String(row.id),
		)
		expect(departments).toHaveLength(2)
		for (let index = 0; index < 2; index++) {
			const role = `scope-role-${index}`
			await admin.query('INSERT INTO hcm.access_role (tenant_id,id,label) VALUES ($1,$2,$2)', [
				tenant,
				role,
			])
			await admin.query(
				'INSERT INTO hcm.role_permission (tenant_id,role_id,permission_code) VALUES ($1,$2,$3)',
				[tenant, role, permission],
			)
			await admin.query(
				"INSERT INTO hcm.account_role (tenant_id,account_id,role_id,grant_id) VALUES ($1,'dunder-mifflin/account/jim',$2,$2)",
				[tenant, role],
			)
			await admin.query(
				"INSERT INTO hcm.account_role_scope (tenant_id,id,grant_id,scope_kind,employment_id) VALUES ($1,$2,$3,'Employment',$4)",
				[tenant, `employment-${index}`, role, index === 0 ? jimEmployment : pamEmployment],
			)
			await admin.query(
				"INSERT INTO hcm.account_role_scope (tenant_id,id,grant_id,scope_kind,department_id) VALUES ($1,$2,$3,'Department',$4)",
				[tenant, `department-${index}`, role, departments[index]],
			)
		}
		database = new HcmAccessDatabase(connection('RUNTIME'))
		store = new HcmRuntimeStore(connection('RUNTIME'))
		const application = new HcmRuntimeApplication(
			createTenantDirectory(environment, store),
			createSessionReader(environment, store),
		)
		context = await application.authenticate(
			await application.resolveTenant('acme.localhost', '127.0.0.1'),
			undefined,
			{ tenantId: tenant, peerAddress: '127.0.0.1', developmentPersona: 'jim' },
		)
	},
)

afterAll(
	/** Drain all connections allocated by this suite. */ async () => {
		await database?.onApplicationShutdown()
		await store?.onApplicationShutdown()
		await runtime?.end()
		await admin?.end()
	},
)

it('requires one complete grant and refuses unscoped access from restricted grants', /** The accepted grant must cover both dimensions; a second grant cannot donate a missing predicate. */ async () => {
	await expect(
		authorize({ employmentId: jimEmployment, departmentId: departments[0] }),
	).resolves.toMatchObject({ grantId: 'scope-role-0' })
	await expect(
		authorize({ employmentId: pamEmployment, departmentId: departments[1] }),
	).resolves.toMatchObject({ grantId: 'scope-role-1' })
	await expect(
		authorize({ employmentId: jimEmployment, departmentId: departments[1] }),
	).rejects.toMatchObject({ code: 'forbidden' })
	await expect(authorize({ employmentId: jimEmployment })).rejects.toMatchObject({
		code: 'forbidden',
	})
	await expect(authorize()).rejects.toMatchObject({ code: 'forbidden' })
})

it('preserves unscoped grants and matches alternatives without relaxing other dimensions', /** Existing grants stay tenant-wide while a scoped grant intersects dimensions and rejects a foreign tenant marker. */ () => {
	expect(grantCoversSubject([], tenant)).toBe(true)
	expect(
		grantCoversSubject(
			[
				{ dimension: 'employmentId', targetId: 'a' },
				{ dimension: 'employmentId', targetId: 'b' },
				{ dimension: 'departmentId', targetId: 'sales' },
			],
			tenant,
			{ employmentId: 'b', departmentId: 'sales' },
		),
	).toBe(true)
	expect(grantCoversSubject([{ dimension: 'tenant', targetId: 'other' }], tenant)).toBe(false)
})

it('requires a single grant across a dated impact set and denies empty restricted operations', /** Two individually authorized subjects cannot pool different grants for one assignment. */ async () => {
	const jim = { employmentId: jimEmployment, departmentId: departments[0] },
		pam = { employmentId: pamEmployment, departmentId: departments[1] }
	await expect(
		database.execute(
			context,
			{ permission, entitlement: 'hcm.access-control', subjects: [jim, jim] },
			false,
			actor,
		),
	).resolves.toMatchObject({ grantId: 'scope-role-0' })
	await expect(
		database.execute(
			context,
			{ permission, entitlement: 'hcm.access-control', subjects: [jim, pam] },
			false,
			actor,
		),
	).rejects.toMatchObject({ code: 'forbidden' })
	await expect(
		database.execute(
			context,
			{ permission, entitlement: 'hcm.access-control', subjects: [] },
			false,
			actor,
		),
	).rejects.toMatchObject({ code: 'forbidden' })
	await expect(
		database.execute(
			context,
			{ permission, entitlement: 'hcm.access-control' },
			false,
			actor,
			/** A source resolver runs within the same tenant and revocation transaction. */ async (
				transaction,
			) => {
				const row = await transaction
					.selectFrom('hcm.user_account')
					.select('id')
					.where('id', '=', 'dunder-mifflin/account/jim')
					.executeTakeFirst()
				expect(row?.id).toBe('dunder-mifflin/account/jim')
				return [jim]
			},
		),
	).resolves.toMatchObject({ grantId: 'scope-role-0' })
})

it('serializes authorization with revocation and observes the committed scope change', /** An administrative lock gates the policy reload; after revocation no stale session or grant snapshot authorizes. */ async () => {
	await admin.query('BEGIN')
	await admin.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [tenant])
	await admin.query("DELETE FROM hcm.role_permission WHERE role_id='scope-role-0'")
	const pending = authorize({ employmentId: jimEmployment, departmentId: departments[0] })
	const assertion = expect(pending).rejects.toMatchObject({ code: 'forbidden' })
	await admin.query('COMMIT')
	await assertion
	await admin.query(
		"INSERT INTO hcm.role_permission (tenant_id,role_id,permission_code) VALUES ($1,'scope-role-0',$2)",
		[tenant, permission],
	)
})

it('denies missing operation authority before resolving any source facts', /** Unauthorized requests cannot probe source existence through a resolver error. */ async () => {
	let readSource = false
	await expect(
		database.execute(
			context,
			{ permission: 'hcm.attendance.holiday-calendars.manage', entitlement: 'hcm.attendance' },
			false,
			actor,
			/** Detect any premature source access without returning business information. */ async () => {
				readSource = true
				throw new Error('Source lookup must not run')
			},
		),
	).rejects.toMatchObject({ code: 'forbidden' })
	expect(readSource).toBe(false)
})

it('protects administrator grants and enforces exactly one typed scope target', /** SQL rejects narrowing protected administration and malformed or mutable scope rows independently of transport. */ async () => {
	const grant = (
		await admin.query(
			"SELECT grant_id FROM hcm.account_role WHERE role_id='tenant-administrator' LIMIT 1",
		)
	).rows[0].grant_id
	await expect(
		runtime.query(
			"INSERT INTO hcm.account_role_scope (tenant_id,id,grant_id,scope_kind) VALUES ($1,'protected',$2,'Tenant')",
			[tenant, grant],
		),
	).rejects.toMatchObject({ code: '23514' })
	await expect(
		runtime.query(
			"INSERT INTO hcm.account_role_scope (tenant_id,id,grant_id,scope_kind,employment_id,department_id) VALUES ($1,'invalid','scope-role-0','Employment',$2,$3)",
			[tenant, jimEmployment, departments[0]],
		),
	).rejects.toMatchObject({ code: '23514' })
	await expect(
		runtime.query("UPDATE hcm.account_role_scope SET employment_id=$1 WHERE id='employment-0'", [
			pamEmployment,
		]),
	).rejects.toMatchObject({ code: '42501' })
})

it('isolates real foreign scope rows and rejects tenant and grant substitution', /** Create a second tenant and prove both RLS invisibility and composite foreign-key enforcement. */ async () => {
	await admin.query("SELECT set_config('hcm.tenant_id','scope-other',false)")
	try {
		await admin.query(
			"INSERT INTO hcm.tenant (id,slug,display_name,status,defaults) VALUES ('scope-other','scope-other','Other','active','{}')",
		)
		await admin.query(
			"INSERT INTO hcm.person (tenant_id,id,given_name,family_name,display_name) VALUES ('scope-other','foreign-person','Other','Person','Other Person')",
		)
		await admin.query(
			"INSERT INTO hcm.user_account (tenant_id,id,person_id,email) VALUES ('scope-other','foreign-account','foreign-person','other@example.invalid')",
		)
		await admin.query(
			"INSERT INTO hcm.access_role (tenant_id,id,label) VALUES ('scope-other','foreign-role','Foreign role')",
		)
		await admin.query(
			"INSERT INTO hcm.account_role (tenant_id,account_id,role_id,grant_id) VALUES ('scope-other','foreign-account','foreign-role','foreign-grant')",
		)
		await admin.query(
			"INSERT INTO hcm.account_role_scope (tenant_id,id,grant_id,scope_kind) VALUES ('scope-other','foreign-scope','foreign-grant','Tenant')",
		)
	} finally {
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
	}
	expect(
		(await runtime.query("SELECT id FROM hcm.account_role_scope WHERE id='foreign-scope'")).rows,
	).toEqual([])
	await expect(
		runtime.query(
			"INSERT INTO hcm.account_role_scope (tenant_id,id,grant_id,scope_kind) VALUES ('scope-other','hostile','foreign-grant','Tenant')",
		),
	).rejects.toMatchObject({ code: '42501' })
	await expect(
		runtime.query(
			"INSERT INTO hcm.account_role_scope (tenant_id,id,grant_id,scope_kind) VALUES ($1,'hostile','foreign-grant','Tenant')",
			[tenant],
		),
	).rejects.toMatchObject({ code: '23503' })
	expect(
		(
			await admin.query(
				"SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='hcm.account_role_scope'::regclass",
			)
		).rows[0],
	).toEqual({ relrowsecurity: true, relforcerowsecurity: true })
})
