import { beforeAll, afterAll, it, expect, vi } from 'vitest'
import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { sql, type Transaction } from 'kysely'
import { HcmTenantDatabase } from '@empflowyee/hcm-api-database-kysely'
import { migrateHcmDatabase, loadSqlMigrations } from '@empflowyee/hcm-api-database-migrations'
import { runDevelopmentSeeds } from '@empflowyee/hcm-api-database-seed'
import {
	HcmRuntimeApplication,
	HcmWorkloadIssuer,
	HcmActionAuthorityResolver,
	requireAuthenticatedScope,
	requireHcmActionAuthority,
	type AuthenticatedHcmContext,
	type HcmWorkloadContext,
	type HcmActionBinding,
} from '@empflowyee/hcm-api-runtime-application'
import {
	HcmRuntimeStore,
	createTenantDirectory,
	createSessionReader,
	KyselyHcmActionAuthorizationBinder,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import {
	TransactionalActionAccessPolicy,
	type AccessTables,
} from '@empflowyee/hcm-api-access-control-infrastructure'

const tenant = 'local-dunder-mifflin'
const account = 'dunder-mifflin/account/david'
const permission = 'hcm.attendance.work-schedules.manage'
const environment = {
	APP_ENVIRONMENT: 'local',
	NODE_ENV: 'test',
	HCM_LOCAL_TENANTS: 'true',
	HCM_LOCAL_SESSION: 'true',
}
const binder = new KyselyHcmActionAuthorizationBinder()
let admin: Client
let runtime: Client
let directory: HcmRuntimeStore
let database: HcmTenantDatabase<AccessTables>
let application: HcmRuntimeApplication
let actor: AuthenticatedHcmContext
let dispatch: HcmWorkloadContext
let issuer: HcmWorkloadIssuer

/** Use only the ephemeral database injected by the integration harness. */
function connection(role: string): string {
	const value = process.env[`HCM_TEST_${role}`]
	if (!value) throw new Error('Disposable PostgreSQL harness required')
	return value
}

/** Model one unique canonical intent without embedding any private business narrative. */
function binding(): HcmActionBinding {
	return {
		permission,
		scopeReference: 'a'.repeat(64),
		intentDigest: randomUUID().replaceAll('-', '').repeat(2),
	}
}

/** Authenticate the real canonical local persona through Runtime's existing development session adapter. */
async function authenticate() {
	return application.authenticate(
		await application.resolveTenant('acme.localhost', '127.0.0.1'),
		undefined,
		{ tenantId: tenant, peerAddress: '127.0.0.1', developmentPersona: 'david' },
	)
}

/** Issue a reference in the same transaction boundary used by online source commands. */
async function issue(input: HcmActionBinding, context = actor) {
	return database.transaction(
		context,
		/** Capture only privately verified server authority. */ (tx) =>
			binder.bind(tx, tenant).issue(context, input),
	)
}

/** Reconstruct dispatch provenance from a real immutable SQL record inside a verified worker transaction. */
async function withAuthority<T>(
	referenceId: string,
	input: HcmActionBinding,
	work: (
		tx: Transaction<AccessTables>,
		authority: Awaited<ReturnType<HcmActionAuthorityResolver['resolve']>>,
	) => Promise<T>,
) {
	return database.workloadTransaction(
		dispatch,
		'WorkflowDispatch',
		/** Keep restore, authorization and effect under the same current-tenant lock. */ async (
			tx,
		) => {
			const authority = await new HcmActionAuthorityResolver(binder.bind(tx, tenant)).resolve(
				dispatch,
				referenceId,
				input,
			)
			const result = await work(tx, authority)
			requireHcmActionAuthority(authority)
			return result
		},
	)
}

beforeAll(
	/** Migrate isolated SQL and seed actual accounts before testing durable action admission. */ async () => {
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
		directory = new HcmRuntimeStore(connection('RUNTIME'))
		database = new HcmTenantDatabase({ connectionString: connection('RUNTIME'), maxConnections: 2 })
		application = new HcmRuntimeApplication(
			createTenantDirectory(environment, directory),
			createSessionReader(environment, directory),
		)
		actor = await authenticate()
		expect(requireAuthenticatedScope(actor).accountId).toBe(account)
		issuer = new HcmWorkloadIssuer(directory, ['WorkflowDispatch', 'WorkflowPlan'])
		dispatch = await issuer.issue(tenant, 'WorkflowDispatch', randomUUID(), 300000)
	},
)

afterAll(
	/** Release only suite-owned connections and restore the clock after failure injection. */ async () => {
		vi.restoreAllMocks()
		await database?.destroy()
		await directory?.onApplicationShutdown()
		await runtime?.end()
		await admin?.end()
	},
)

it('captures private authority, rejects forged contexts and preserves expiry on replay', /** Public DTO changes and later sessions cannot replace the original actor or extend an admitted action. */ async () => {
	const input = binding()
	const context = await authenticate()
	const original = requireAuthenticatedScope(context)
	context.session.user.id = 'forged-account'
	context.session.session.expiresAt = '2199-01-01T00:00:00Z'
	const reference = await issue(input, context)
	expect(await issue(input, await authenticate())).toBe(reference)
	await database.transaction(
		actor,
		/** Inspect the owner projection rather than accepting public session fields. */ async (tx) => {
			expect(await binder.bind(tx, tenant).read(reference)).toMatchObject({
				accountId: account,
				expiresAt: original.expiresAt,
			})
			await expect(binder.bind(tx, tenant).issue({ ...context }, binding())).rejects.toThrow(
				'unauthenticated',
			)
			await expect(
				binder.bind(tx, tenant).issue(actor, { ...input, scopeReference: 'b'.repeat(64) }),
			).rejects.toThrow('forbidden')
		},
	)
	await expect(
		runtime.query(
			"UPDATE hcm.runtime_action_authorization SET expires_at=expires_at+interval '1 hour' WHERE id=$1",
			[reference],
		),
	).rejects.toMatchObject({ code: '42501' })
})

it('requires verified dispatch, exact bindings and registered capabilities', /** Serialized references alone cannot authorize source decisions or be used for another operation. */ async () => {
	const input = binding(),
		reference = await issue(input)
	await withAuthority(
		reference,
		input,
		/** Check private registration and current real grants. */ async (tx, authority) => {
			expect(requireHcmActionAuthority(authority).accountId).toBe(account)
			expect(
				/** A JSON copy has no Runtime registration. */ () =>
					requireHcmActionAuthority({ ...authority }),
			).toThrow('unauthenticated')
			const policy = new TransactionalActionAccessPolicy(tx, authority, input.scopeReference)
			expect((await policy.require({ permission, entitlement: 'hcm.attendance' })).accountId).toBe(
				account,
			)
			await expect(
				policy.require({
					permission: 'hcm.access-control.roles.manage',
					entitlement: 'hcm.access-control',
				}),
			).rejects.toThrow('forbidden')
			await expect(
				new TransactionalActionAccessPolicy(tx, authority, 'b'.repeat(64)).require({
					permission,
					entitlement: 'hcm.attendance',
				}),
			).rejects.toThrow('forbidden')
		},
	)
	await database.workloadTransaction(
		dispatch,
		'WorkflowDispatch',
		/** Reject altered intent identity and a planner attempting dispatch. */ async (tx) => {
			const resolver = new HcmActionAuthorityResolver(binder.bind(tx, tenant))
			await expect(
				resolver.resolve(dispatch, reference, { ...input, intentDigest: 'f'.repeat(64) }),
			).rejects.toThrow('forbidden')
			await expect(resolver.resolve({ ...dispatch }, reference, input)).rejects.toThrow(
				'unauthenticated',
			)
			await expect(
				resolver.resolve(
					await issuer.issue(tenant, 'WorkflowPlan', randomUUID()),
					reference,
					input,
				),
			).rejects.toThrow('forbidden')
		},
	)
})

it('enforces RLS, composite actor ownership and transaction binding', /** Even a valid dispatch cannot resolve authority belonging to another tenant. */ async () => {
	const input = binding(),
		reference = await issue(input)
	await database.transaction(
		actor,
		/** Reject mismatched owner binders and verify unfiltered RLS after switching only the test transaction context. */ async (
			tx,
		) => {
			await expect(binder.bind(tx, 'foreign').read(reference)).rejects.toThrow('forbidden')
			await sql`SELECT set_config('hcm.tenant_id','authority-other',true)`.execute(tx)
			expect((await sql`SELECT id FROM hcm.runtime_action_authorization`.execute(tx)).rows).toEqual(
				[],
			)
			expect(await binder.bind(tx, 'authority-other').read(reference)).toBeNull()
			await expect(
				new HcmActionAuthorityResolver(binder.bind(tx, 'authority-other')).resolve(
					dispatch,
					reference,
					input,
				),
			).rejects.toThrow('forbidden')
		},
	)
	await expect(
		runtime.query(
			"INSERT INTO hcm.runtime_action_authorization(tenant_id,id,actor_account_id,expires_at,permission,scope_reference,intent_digest) VALUES($1,$2,'missing-account',now()+interval '1 hour',$3,$4,$5)",
			[tenant, randomUUID(), permission, input.scopeReference, binding().intentDigest],
		),
	).rejects.toMatchObject({ code: '23503' })
	expect(
		/** A pool-like object cannot be bound as an authorized transaction. */ () =>
			binder.bind({ isTransaction: false }, tenant),
	).toThrow('forbidden')
})

it('rolls back authority with its admitting transaction', /** A crashed producer cannot leave an independently usable action reference. */ async () => {
	const input = binding()
	await expect(
		database.transaction(
			actor,
			/** Fail after insertion to exercise the real transaction rollback. */ async (tx) => {
				await binder.bind(tx, tenant).issue(actor, input)
				throw new Error('injected rollback')
			},
		),
	).rejects.toThrow('injected rollback')
	expect(
		(
			await admin.query('SELECT id FROM hcm.runtime_action_authorization WHERE intent_digest=$1', [
				input.intentDigest,
			])
		).rows,
	).toEqual([])
})

it('rechecks revocation and account disablement before a new action', /** A stored authority reference is never a frozen copy of grants. */ async () => {
	const input = binding(),
		reference = await issue(input)
	await admin.query('UPDATE hcm.user_account SET enabled=false WHERE id=$1', [account])
	try {
		await expect(
			withAuthority(
				reference,
				input,
				/** Disabled real accounts have no decision authority. */ async (tx, authority) =>
					new TransactionalActionAccessPolicy(tx, authority, input.scopeReference).require({
						permission,
						entitlement: 'hcm.attendance',
					}),
			),
		).rejects.toThrow('unauthenticated')
	} finally {
		await admin.query('UPDATE hcm.user_account SET enabled=true WHERE id=$1', [account])
	}
	await admin.query('UPDATE hcm.tenant_entitlement SET enabled=false WHERE code=$1', [
		'hcm.attendance',
	])
	try {
		await expect(
			withAuthority(
				reference,
				input,
				/** Entitlement revocation takes effect despite an earlier successful admission. */ async (
					tx,
					authority,
				) =>
					new TransactionalActionAccessPolicy(tx, authority, input.scopeReference).require({
						permission,
						entitlement: 'hcm.attendance',
					}),
			),
		).rejects.toThrow('forbidden')
	} finally {
		await admin.query('UPDATE hcm.tenant_entitlement SET enabled=true WHERE code=$1', [
			'hcm.attendance',
		])
	}
	const grants = (
		await admin.query(
			'DELETE FROM hcm.role_permission WHERE permission_code=$1 RETURNING role_id',
			[permission],
		)
	).rows
	try {
		await expect(
			withAuthority(
				reference,
				input,
				/** Current exact permission revocation defeats a previously issued durable reference. */ async (
					tx,
					authority,
				) =>
					new TransactionalActionAccessPolicy(tx, authority, input.scopeReference).require({
						permission,
						entitlement: 'hcm.attendance',
					}),
			),
		).rejects.toThrow('forbidden')
	} finally {
		for (const grant of grants)
			await admin.query(
				'INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,$2,$3)',
				[tenant, grant.role_id, permission],
			)
	}
})

it('denies expired human authority and rolls back effects when it expires before commit', /** Worker execution cannot renew the human session or retain an effect past the source commit guard. */ async () => {
	const input = binding(),
		reference = await issue(input)
	const expiry = requireAuthenticatedScope(actor).expiresAt
	const clock = vi.spyOn(Date, 'now')
	try {
		await expect(
			withAuthority(
				reference,
				input,
				/** Move beyond human expiry after a write; the wrapper's source guard must roll everything back. */ async (
					tx,
				) => {
					await sql`INSERT INTO hcm.access_role(tenant_id,id,label) VALUES(${tenant},'expired-action-effect','Must roll back')`.execute(
						tx,
					)
					clock.mockReturnValue(expiry + 1)
				},
			),
		).rejects.toThrow('unauthenticated')
		const laterWorker = await issuer.issue(tenant, 'WorkflowDispatch', randomUUID(), 60000)
		await expect(
			database.workloadTransaction(
				laterWorker,
				'WorkflowDispatch',
				/** A newly issued worker capability still cannot revive the old human. */ async (tx) =>
					new HcmActionAuthorityResolver(binder.bind(tx, tenant)).resolve(
						laterWorker,
						reference,
						input,
					),
			),
		).rejects.toThrow('unauthenticated')
	} finally {
		clock.mockRestore()
	}
	expect(
		(await admin.query("SELECT id FROM hcm.access_role WHERE id='expired-action-effect'")).rows,
	).toEqual([])
})
