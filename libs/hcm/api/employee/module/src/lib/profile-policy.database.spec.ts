import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { Client, Pool } from 'pg'
import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely'
import { migrateHcmDatabase, loadSqlMigrations } from '@empflowyee/hcm-api-database-migrations'
import { runDevelopmentSeeds } from '@empflowyee/hcm-api-database-seed'
import type { EmployeePorts } from '@empflowyee/hcm-api-employee-application'
import {
	KyselyEmployeePortBinder,
	KyselyOrgChartFieldPolicyBinder,
} from '@empflowyee/hcm-api-employee-infrastructure'
import type { OrgChartFieldPolicy } from '@empflowyee/hcm-api-workforce-foundation-application'
import { KyselyWorkforcePortBinder } from '@empflowyee/hcm-api-workforce-foundation-infrastructure'

const TENANT = 'local-dunder-mifflin'
const P = 'dunder-mifflin/'
const TODAY = '2026-09-26'
let admin: Client
let runtime: Kysely<unknown>

/** Rolled back on purpose so each case starts from the seeded policy. */
class Rollback extends Error {}

/** Run as the restricted runtime role in one tenant transaction that is always rolled back. */
async function asRuntime<T>(
	work: (
		ports: EmployeePorts & { orgChart: OrgChartFieldPolicy; trx: Transaction<unknown> },
	) => Promise<T>,
	tenant = TENANT,
): Promise<T> {
	let result: T | undefined
	try {
		await runtime.transaction().execute(
			/** Install tenant context, bind the ports, then run the case. */ async (trx) => {
				await sql`SELECT set_config('hcm.tenant_id', ${tenant}, true)`.execute(trx)
				const actor = { tenantId: tenant, accountId: P + 'account/toby' }
				result = await work({
					...new KyselyEmployeePortBinder(new KyselyWorkforcePortBinder()).bind(trx, actor),
					orgChart: new KyselyOrgChartFieldPolicyBinder().bind(trx, actor),
					trx,
				})
				throw new Rollback()
			},
		)
	} catch (error) {
		if (!(error instanceof Rollback)) throw error
	}
	return result as T
}

/** Execute one statement as runtime and return the SQLSTATE it fails with, or 'ok'. */
async function sqlState(
	statement: ReturnType<typeof sql> | ReturnType<typeof sql>[],
	commit = false,
): Promise<string> {
	try {
		await runtime.transaction().execute(
			/** Tenant context, statement, then roll back unless a deferred check must fire. */ async (
				trx,
			) => {
				await sql`SELECT set_config('hcm.tenant_id', ${TENANT}, true)`.execute(trx)
				for (const step of Array.isArray(statement) ? statement : [statement])
					await step.execute(trx)
				if (!commit) throw new Rollback()
				await sql`SET CONSTRAINTS ALL IMMEDIATE`.execute(trx)
				throw new Rollback()
			},
		)
		return 'ok'
	} catch (error) {
		if (error instanceof Rollback) return 'ok'
		return (error as { code?: string }).code ?? 'error'
	}
}

/** Strip the reference prefix for readable assertions. */
function codes(refs: ReadonlySet<string> | undefined): string[] {
	return [...(refs ?? [])].map(/** Code. */ (ref) => ref.replace(/^standard:/, '')).sort()
}

beforeAll(
	/** Migrate and seed the disposable database, then connect as the restricted runtime role. */ async () => {
		const migrator = process.env['HCM_TEST_MIGRATOR']
		const runtimeUrl = process.env['HCM_TEST_RUNTIME']
		if (!migrator || !runtimeUrl) throw new Error('Disposable database required')
		admin = new Client({ connectionString: migrator })
		await admin.connect()
		await admin.query('DROP SCHEMA IF EXISTS hcm CASCADE')
		const inventory = resolve('libs/hcm/api/database/migrations/sql')
		await migrateHcmDatabase(migrator, inventory)
		await runDevelopmentSeeds({
			env: {
				APP_ENVIRONMENT: 'local',
				NODE_ENV: 'test',
				HCM_SEED_TARGET: TENANT,
				HCM_SEED_DATABASE_URL: migrator,
			},
			manifestDirectory: resolve('libs/hcm/api/database/seed/manifest'),
			migrations: await loadSqlMigrations(inventory),
		})
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [TENANT])
		runtime = new Kysely({
			dialect: new PostgresDialect({ pool: new Pool({ connectionString: runtimeUrl, max: 2 }) }),
		})
	},
)
afterAll(
	/** Release connections. */ async () => {
		await runtime?.destroy()
		await admin?.end()
	},
)

describe('employee profile policy foundation', /** Migration 000022 and employee ports. */ () => {
	it('serves the product catalogue with Dunder Mifflin narrowing and runtime read-only product rows', /** Migration 000022 and employee.profile@1. */ async () => {
		const fields = await asRuntime(
			/** Read the merged catalogue. */ async ({ trx }) =>
				(
					await sql<{
						code: string
						visibility: string
						tenant: string | null
					}>`SELECT d.code,p.visibility,t.visibility AS tenant FROM hcm.profile_field_definition d JOIN hcm.profile_field_default_policy p ON p.field_code=d.code LEFT JOIN hcm.profile_field_tenant_policy t ON t.standard_field_code=d.code AND t.effective_until_at IS NULL ORDER BY d.sort_order`.execute(
						trx,
					)
				).rows,
		)
		expect(fields).toHaveLength(36)
		expect(fields.find(/** Narrowed. */ (row) => row.code === 'work-mode')).toEqual({
			code: 'work-mode',
			visibility: 'Organization',
			tenant: 'Manager',
		})
		expect(fields.filter(/** Only one tenant row. */ (row) => row.tenant)).toHaveLength(1)
		const privileges = await admin.query<{ relation: string; privilege: string; granted: boolean }>(
			"SELECT r AS relation,p AS privilege,has_table_privilege('hcm_runtime','hcm.'||r,p) AS granted FROM unnest(ARRAY['profile_field_definition','profile_field_default_policy','profile_field_tenant_policy','profile_visibility_preference','custom_field_definition','custom_field_option','custom_field_value','custom_field_value_option','employee_command_receipt']) r, unnest(ARRAY['INSERT','DELETE','TRUNCATE']) p WHERE has_table_privilege('hcm_runtime','hcm.'||r,p)",
		)
		expect(
			privileges.rows
				.map(/** Granted writes. */ (row) => `${row.relation}:${row.privilege}`)
				.sort(),
		).toEqual([
			'custom_field_definition:INSERT',
			'custom_field_option:INSERT',
			'employee_command_receipt:INSERT',
			'profile_field_tenant_policy:INSERT',
			'profile_visibility_preference:INSERT',
		])
		const fixed = await admin.query(
			"SELECT c FROM unnest(ARRAY['code','owner_scope','data_type','sensitivity']) c WHERE has_column_privilege('hcm_runtime','hcm.custom_field_definition',c,'UPDATE')",
		)
		expect(fixed.rows).toEqual([])
		const rls = await admin.query(
			"SELECT relname FROM pg_class WHERE relnamespace='hcm'::regnamespace AND relname IN ('profile_field_tenant_policy','profile_visibility_preference','custom_field_definition','custom_field_option','custom_field_value','custom_field_value_option','employee_command_receipt') AND relrowsecurity AND relforcerowsecurity",
		)
		expect(rls.rows).toHaveLength(7)
	})

	it('computes cumulative allowlists per viewer relation', /** Ceiling, product default and tenant narrowing. */ async () => {
		const result = await asRuntime(
			/** Evaluate every relation. */ async ({ visibility }) => ({
				organization: codes(await visibility.baseline('Organization')),
				manager: codes(await visibility.baseline('Manager')),
				hr: codes(await visibility.baseline('Hr')),
				self: (await visibility.baseline('Self')).size,
				search: codes(await visibility.searchable('Organization')),
			}),
		)
		expect(result.organization).toEqual([
			'department',
			'designation',
			'display-name',
			'legal-entity',
			'location',
			'manager',
			'organisation-unit',
			'preferred-name',
			'work-email',
			'worker-number',
		])
		expect(result.manager).toContain('work-mode')
		expect(result.manager).toContain('hire-date')
		expect(result.manager).not.toContain('birth-date')
		expect(result.hr).toContain('birth-date')
		expect(result.hr).toContain('blood-group')
		expect(result.self).toBe(36)
		expect(result.search).toEqual(['display-name', 'preferred-name', 'work-email', 'worker-number'])
	})

	it('honours allowed worker preferences and refuses widening at the database', /** Narrow-only policy, triggers as final guard. */ async () => {
		const perWorker = await asRuntime(
			/** Jim keeps his preferred name within the team. */ async ({
				trx,
				visibility,
				orgChart,
			}) => {
				await sql`INSERT INTO hcm.profile_visibility_preference(tenant_id,id,worker_id,standard_field_code,visibility) VALUES (${TENANT},'pref-jim',${P + 'worker/jim'},'preferred-name','Manager')`.execute(
					trx,
				)
				const workers = [P + 'worker/jim', P + 'worker/pam']
				return {
					fields: await visibility.visibleFields('Organization', workers),
					manager: await visibility.visibleFields('Manager', workers),
					chart: await orgChart.organizationFields(workers),
					effective: await visibility.effective(P + 'worker/jim'),
				}
			},
		)
		expect(codes(perWorker.fields.get(P + 'worker/jim'))).not.toContain('preferred-name')
		expect(codes(perWorker.fields.get(P + 'worker/pam'))).toContain('preferred-name')
		expect(codes(perWorker.manager.get(P + 'worker/jim'))).toContain('preferred-name')
		expect([...(perWorker.chart.get(P + 'worker/jim') ?? [])].sort()).toEqual([
			'department',
			'designation',
			'display-name',
			'location',
			'manager',
			'organisation-unit',
			'work-email',
			'worker-number',
		])
		expect([...(perWorker.chart.get(P + 'worker/pam') ?? [])]).toContain('preferred-name')
		expect(perWorker.effective.get('standard:preferred-name')).toBe('Manager')
		expect(perWorker.effective.get('standard:work-mode')).toBe('Manager')

		/** A tenant policy insert for one standard field. */
		const policy = (field: string, visibility: string, mode: string, requiredness = 'Optional') =>
			sql`INSERT INTO hcm.profile_field_tenant_policy(tenant_id,id,standard_field_code,requiredness_context,requiredness,visibility,self_edit_mode) VALUES (${TENANT},${'p-' + field},${field},'WorkforceActivation',${requiredness},${visibility},${mode})`
		expect(await sqlState(policy('birth-date', 'Organization', 'ServiceRequest'))).toBe('23514')
		expect(await sqlState(policy('legal-given-name', 'Hr', 'Direct', 'Required'))).toBe('23514')
		expect(await sqlState(policy('legal-given-name', 'Hr', 'ServiceRequest', 'Optional'))).toBe(
			'23514',
		)
		expect(await sqlState(policy('legal-given-name', 'Self', 'NotEditable', 'Required'))).toBe('ok')
		expect(await sqlState(policy('work-mode', 'Hr', 'NotEditable'))).toBe('23505')
		expect(
			await sqlState(
				sql`INSERT INTO hcm.profile_field_tenant_policy(tenant_id,id,standard_field_code,requiredness_context,requiredness,visibility,self_edit_mode,requires_verification) VALUES (${TENANT},'verify','personal-email','WorkforceActivation','Optional','Hr','Direct',true)`,
			),
		).toBe('23514')
		expect(
			await sqlState(
				sql`INSERT INTO hcm.profile_visibility_preference(tenant_id,id,worker_id,standard_field_code,visibility) VALUES (${TENANT},'pref-birth',${P + 'worker/jim'},'birth-date','Self')`,
			),
		).toBe('23514')
	})

	it('keeps custom fields within their sensitivity ceiling and values in the right shape', /** Custom definitions, policy and deferred value trigger. */ async () => {
		const define = sql`INSERT INTO hcm.custom_field_definition(tenant_id,id,code,name,owner_scope,data_type,sensitivity,section_code) VALUES (${TENANT},'cf-shoe','SHOE_SIZE','Shoe size','Worker','Integer','Personal','Personal'),(${TENANT},'cf-badge','BADGE','Badge','Person','Text','Sensitive','Identity')`
		/** Define both custom fields, then narrow the shoe size field. */
		const customPolicy = (visibility: string) => [
			define,
			sql`INSERT INTO hcm.profile_field_tenant_policy(tenant_id,id,custom_field_id,requiredness_context,requiredness,visibility,self_edit_mode) VALUES (${TENANT},'cp','cf-shoe','WorkforceActivation','Optional',${visibility},'Direct')`,
		]
		expect(await sqlState(customPolicy('Organization'))).toBe('23514')
		expect(await sqlState(customPolicy('Manager'))).toBe('ok')
		expect(
			await sqlState(
				sql`INSERT INTO hcm.custom_field_definition(tenant_id,id,code,name,owner_scope,data_type,sensitivity,section_code,is_searchable_when_visible) VALUES (${TENANT},'cf-x','SECRET','Secret','Person','Text','Personal','Other',true)`,
			),
		).toBe('23514')
		// Values are written by later apps, so runtime cannot insert them yet.
		expect(
			await sqlState(
				sql`INSERT INTO hcm.custom_field_value(tenant_id,id,custom_field_id,worker_id,integer_value,effective_from) VALUES (${TENANT},'v1','cf-shoe',${P + 'worker/jim'},10,'2026-01-01')`,
			),
		).toBe('42501')
		// The migrator arranges values to prove the deferred shape rules.
		await admin.query('BEGIN')
		try {
			await admin.query(
				"INSERT INTO hcm.custom_field_definition(tenant_id,id,code,name,owner_scope,data_type,sensitivity,section_code) VALUES ($1,'cf-shoe','SHOE_SIZE','Shoe size','Worker','Integer','Personal','Personal'),($1,'cf-badge','BADGE','Badge','Person','Text','Sensitive','Identity')",
				[TENANT],
			)
			await admin.query('SAVEPOINT s')
			/** Insert one value, force deferred checks and report the SQLSTATE. */
			const shape = async (statement: string, params: unknown[]) => {
				try {
					await admin.query(statement, params)
					await admin.query('SET CONSTRAINTS ALL IMMEDIATE')
					await admin.query('SET CONSTRAINTS ALL DEFERRED')
					await admin.query('RELEASE SAVEPOINT s; SAVEPOINT s')
					return 'ok'
				} catch (error) {
					await admin.query('ROLLBACK TO SAVEPOINT s')
					return (error as { code?: string }).code
				}
			}
			expect(
				await shape(
					"INSERT INTO hcm.custom_field_value(tenant_id,id,custom_field_id,worker_id,integer_value,effective_from) VALUES ($1,'v1','cf-shoe',$2,42,'2026-01-01')",
					[TENANT, P + 'worker/jim'],
				),
			).toBe('ok')
			expect(
				await shape(
					"INSERT INTO hcm.custom_field_value(tenant_id,id,custom_field_id,person_id,integer_value,effective_from) VALUES ($1,'v2','cf-shoe',$2,42,'2026-01-01')",
					[TENANT, P + 'person/jim'],
				),
			).toBe('23514')
			expect(
				await shape(
					"INSERT INTO hcm.custom_field_value(tenant_id,id,custom_field_id,worker_id,text_value,effective_from) VALUES ($1,'v3','cf-shoe',$2,'42','2027-01-01')",
					[TENANT, P + 'worker/pam'],
				),
			).toBe('23514')
			expect(
				await shape(
					"INSERT INTO hcm.custom_field_value(tenant_id,id,custom_field_id,person_id,text_value,effective_from) VALUES ($1,'v4','cf-badge',$2,'B-7','2026-01-01')",
					[TENANT, P + 'person/jim'],
				),
			).toBe('23514')
			expect(
				await shape(
					"INSERT INTO hcm.custom_field_value(tenant_id,id,custom_field_id,person_id,encrypted_value,encryption_key_version,masked_text_value,effective_from) VALUES ($1,'v5','cf-badge',$2,'\\x0102','local-1','B-•','2026-01-01')",
					[TENANT, P + 'person/jim'],
				),
			).toBe('ok')
			expect(
				await shape(
					"INSERT INTO hcm.custom_field_value(tenant_id,id,custom_field_id,worker_id,integer_value,effective_from) VALUES ($1,'v6','cf-shoe',$2,43,'2026-06-01')",
					[TENANT, P + 'worker/jim'],
				),
			).toBe('23P01')
		} finally {
			await admin.query('ROLLBACK')
		}
	})

	it('resolves team scope from current primary solid lines', /** DEC-HCM2-015: the reporting line selects subjects only. */ async () => {
		const teams = await asRuntime(
			/** Resolve three actors. */ async ({ team }) => ({
				michael: (await team.resolve(P + 'account/michael', TODAY)).workerIds.sort(),
				david: (await team.resolve(P + 'account/david', TODAY)).workerIds.sort(),
				jim: (await team.resolve(P + 'account/jim', TODAY)).workerIds,
				before: (await team.resolve(P + 'account/michael', '2004-12-31')).workerIds,
				includes: await team.includes(P + 'account/michael', P + 'worker/jim', TODAY),
			}),
		)
		expect(teams.michael).toEqual([P + 'worker/dwight', P + 'worker/jim', P + 'worker/pam'])
		expect(teams.david).toEqual([P + 'worker/michael', P + 'worker/toby'])
		expect(teams.jim).toEqual([])
		expect(teams.before).toEqual([])
		expect(teams.includes).toBe(true)
	})

	it('never applies another tenant policy or custom field', /** RLS on every tenant-owned policy table. */ async () => {
		const foreign = 'foreign-employee'
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [foreign])
		try {
			await admin.query(
				"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES($1,$1,'Foreign','active')",
				[foreign],
			)
			await admin.query(
				"INSERT INTO hcm.custom_field_definition(tenant_id,id,code,name,owner_scope,data_type,sensitivity,section_code) VALUES ($1,'foreign-cf','FOREIGN','Foreign','Person','Text','DirectorySafe','Other')",
				[foreign],
			)
			await admin.query(
				"INSERT INTO hcm.profile_field_tenant_policy(tenant_id,id,standard_field_code,requiredness_context,requiredness,visibility,self_edit_mode) VALUES ($1,'foreign-policy','work-email','WorkforceActivation','Recommended','Self','NotEditable')",
				[foreign],
			)
		} finally {
			await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [TENANT])
		}
		const own = await asRuntime(
			/** Dunder Mifflin view. */ async ({ visibility }) => ({
				organization: codes(await visibility.baseline('Organization')),
				custom: [...(await visibility.effective(null)).keys()].filter(
					/** Custom. */ (ref) => ref.startsWith('custom:'),
				),
			}),
		)
		expect(own.organization).toContain('work-email')
		expect(own.custom).toEqual([])
		const theirs = await asRuntime(
			/** Foreign view. */ async ({ visibility }) => ({
				organization: codes(await visibility.baseline('Organization')),
				custom: [...(await visibility.effective(null)).keys()].filter(
					/** Custom. */ (ref) => ref.startsWith('custom:'),
				),
			}),
			foreign,
		)
		expect(theirs.organization).not.toContain('work-email')
		expect(theirs.organization).toContain('work-mode')
		expect(theirs.custom).toEqual(['custom:foreign-cf'])
	})
})
