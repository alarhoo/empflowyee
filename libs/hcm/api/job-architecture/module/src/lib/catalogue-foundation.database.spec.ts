import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { Client, Pool } from 'pg'
import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely'
import { migrateHcmDatabase, loadSqlMigrations } from '@empflowyee/hcm-api-database-migrations'
import { runDevelopmentSeeds } from '@empflowyee/hcm-api-database-seed'
import { KyselyCatalogueReader } from '@empflowyee/hcm-api-job-architecture-infrastructure'

const TENANT = 'local-dunder-mifflin'
const V1 = 'dunder-mifflin/job-catalogue/v1'
const CATALOGUE = 'dunder-mifflin/job-catalogue'
let admin: Client
let runtime: Kysely<unknown>

/** Rolled back on purpose so each case starts from the seeded catalogue. */
class Rollback extends Error {}

/** Read through the catalogue reader as the restricted runtime role, always rolled back. */
async function read<T>(
	work: (reader: KyselyCatalogueReader, trx: Transaction<unknown>) => Promise<T>,
	tenant = TENANT,
): Promise<T> {
	let result: T | undefined
	try {
		await runtime.transaction().execute(
			/** Install tenant context and run the case. */ async (trx) => {
				await sql`SELECT set_config('hcm.tenant_id', ${tenant}, true)`.execute(trx)
				result = await work(
					new KyselyCatalogueReader({
						executor: trx,
						tenantId: tenant,
						accountId: 'dunder-mifflin/account/david',
					}),
					trx,
				)
				throw new Rollback()
			},
		)
	} catch (error) {
		if (!(error instanceof Rollback)) throw error
	}
	return result as T
}

/** Run statements as runtime in one rolled-back transaction and return the SQLSTATE, or 'ok'. */
async function sqlState(statements: ReturnType<typeof sql>[], commit = false): Promise<string> {
	try {
		await runtime.transaction().execute(
			/** Tenant context, statements, then deferred checks when asked. */ async (trx) => {
				await sql`SELECT set_config('hcm.tenant_id', ${TENANT}, true)`.execute(trx)
				for (const statement of statements) await statement.execute(trx)
				if (commit) await sql`SET CONSTRAINTS ALL IMMEDIATE`.execute(trx)
				throw new Rollback()
			},
		)
		return 'ok'
	} catch (error) {
		if (error instanceof Rollback) return 'ok'
		return (error as { code?: string }).code ?? 'error'
	}
}

/** A draft successor of version 1 with one root family, as the commands will create it. */
const draft = [
	sql`INSERT INTO hcm.job_catalogue_version(tenant_id,id,job_catalogue_id,version_number,supersedes_version_id) VALUES (${TENANT},'v2',${CATALOGUE},2,${V1})`,
	sql`INSERT INTO hcm.job_family(tenant_id,id,job_catalogue_version_id,code,name,depth,materialized_path) VALUES (${TENANT},'v2-sales','v2','SALES','Sales',1,'x')`,
	sql`INSERT INTO hcm.career_track(tenant_id,id,job_catalogue_version_id,code,name,kind) VALUES (${TENANT},'v2-ic','v2','IC','Individual Contributor','IndividualContributor')`,
	sql`INSERT INTO hcm.job_band(tenant_id,id,job_catalogue_version_id,code,name,sequence_number) VALUES (${TENANT},'v2-entry','v2','ENTRY','Entry',1)`,
]

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

describe('job architecture catalogue foundation', /** Migration 000024 and job.architecture@1. */ () => {
	it('seeds one published Dunder Mifflin catalogue with the approved shape', /** DEC-HCM2-005, DEC-HCM2-006. */ async () => {
		const { catalogue, version, roots, sales } = await read(
			/** Read the seeded catalogue. */ async (reader) => ({
				catalogue: await reader.catalogue(),
				version: await reader.version(V1),
				roots: await reader.families(V1, { parentId: null, limit: 25 }),
				sales: await reader.families(V1, {
					parentId: 'dunder-mifflin/job-family/v1/SALES',
					limit: 25,
				}),
			}),
		)
		expect(catalogue).toMatchObject({
			code: 'DUNDER_MIFFLIN',
			currentVersionId: V1,
			versions: [
				{
					id: V1,
					versionNumber: 1,
					status: 'Published',
					effectiveFrom: '2000-01-01',
					effectiveTo: null,
					current: true,
				},
			],
		})
		expect(version?.familyCount).toBe(6)
		expect(
			version?.tracks.map(
				/** Track with levels. */ (track) =>
					`${track.kind}:${track.levels.map(/** Code. */ (level) => level.code).join(',')}`,
			),
		).toEqual(['IndividualContributor:IC1,IC2,IC3,IC4', 'Management:M1,M2,M3'])
		expect(
			version?.bands.map(
				/** Band with grades. */ (band) =>
					`${band.name}:${band.grades.map(/** Code. */ (grade) => grade.code).join(',')}`,
			),
		).toEqual(['Entry:G1,G2', 'Professional:G3,G4', 'Senior:G5,G6', 'Leadership:G7,G8'])
		expect(roots.items.map(/** Name. */ (family) => [family.name, family.childCount])).toEqual([
			['Sales', 2],
			['Corporate Services', 2],
		])
		expect(sales.items.map(/** Path. */ (family) => family.path)).toEqual([
			'SALES/INSIDE_SALES',
			'SALES/ACCOUNT_MANAGEMENT',
		])
	})

	it('reads job profiles with filters and full published versions', /** Profiles part of job.architecture@1. */ async () => {
		const result = await read(
			/** Page and filter profiles. */ async (reader) => ({
				all: await reader.profiles({ q: '', limit: 3 }),
				sales: await reader.profiles({
					q: '',
					familyId: 'dunder-mifflin/job-family/v1/SALES',
					limit: 25,
				}),
				accountant: await reader.profiles({ q: 'acc', limit: 25 }),
				drafts: await reader.profiles({ q: '', status: 'Draft', limit: 25 }),
				detail: await reader.profileVersion('dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1'),
			}),
		)
		expect(result.all.items.map(/** Name. */ (profile) => profile.name)).toEqual([
			'Accountant',
			'Human Resources Representative',
			'Regional Manager',
		])
		expect(result.all.nextCursor).not.toBeNull()
		expect(result.sales.items.map(/** Code. */ (profile) => profile.code)).toEqual([
			'REGIONAL_MANAGER',
			'SALES_REPRESENTATIVE',
		])
		expect(result.accountant.items).toEqual([
			{
				id: 'dunder-mifflin/job-profile/ACCOUNTANT',
				code: 'ACCOUNTANT',
				name: 'Accountant',
				family: { id: 'dunder-mifflin/job-family/v1/FINANCE', code: 'FINANCE', name: 'Finance' },
				track: {
					id: 'dunder-mifflin/career-track/v1/IC',
					code: 'IC',
					name: 'Individual Contributor',
					kind: 'IndividualContributor',
				},
				level: { id: 'dunder-mifflin/job-level/v1/IC2', code: 'IC2', name: 'Professional' },
				defaultGrade: { id: 'dunder-mifflin/job-grade/v1/G3', code: 'G3', name: 'Grade 3' },
				status: 'Published',
				currentVersionId: 'dunder-mifflin/job-profile/ACCOUNTANT/v1',
				latestVersionId: 'dunder-mifflin/job-profile/ACCOUNTANT/v1',
			},
		])
		expect(result.drafts.items).toEqual([])
		expect(result.detail).toMatchObject({
			profileCode: 'SALES_REPRESENTATIVE',
			status: 'Published',
			current: true,
			catalogueVersionNumber: 1,
			level: { code: 'IC2' },
			allowedGrades: [
				{ code: 'G3', isDefault: true },
				{ code: 'G4', isDefault: false },
			],
			requirements: [
				{ code: 'EXPERIENCE', minimumQuantity: 1, unit: 'Years', mandatory: true },
				{ code: 'NEGOTIATION', minimumQuantity: null, unit: null, mandatory: false },
			],
			versions: [{ versionNumber: 1, status: 'Published', current: true }],
		})
		expect(JSON.stringify(result.detail)).not.toMatch(/salary|currency|pay/i)
	})

	it('keeps published versions immutable for the runtime', /** Business rule 2, REQ-JOB-CATALOGUE-004. */ async () => {
		const P = 'dunder-mifflin/job-profile/SALES_REPRESENTATIVE/v1'
		for (const statement of [
			sql`UPDATE hcm.job_catalogue_version SET change_summary='x' WHERE id=${V1}`,
			sql`UPDATE hcm.job_catalogue_version SET status='Draft' WHERE id=${V1}`,
			sql`UPDATE hcm.job_family SET name='x' WHERE id='dunder-mifflin/job-family/v1/SALES'`,
			sql`UPDATE hcm.job_grade SET is_active=false WHERE id='dunder-mifflin/job-grade/v1/G1'`,
			sql`INSERT INTO hcm.job_band(tenant_id,id,job_catalogue_version_id,code,name,sequence_number) VALUES (${TENANT},'b',${V1},'EXTRA','Extra',9)`,
			sql`UPDATE hcm.job_profile_version SET summary='x' WHERE id=${P}`,
			sql`DELETE FROM hcm.job_profile_grade WHERE job_profile_version_id=${P}`,
		])
			expect(await sqlState([statement])).toBe('23514')
		// Codes, parents and whole versions are never rewritten or deleted by the runtime.
		for (const statement of [
			sql`UPDATE hcm.job_family SET code='X' WHERE id='dunder-mifflin/job-family/v1/SALES'`,
			sql`DELETE FROM hcm.job_catalogue_version WHERE id=${V1}`,
			sql`DELETE FROM hcm.job_family WHERE id='dunder-mifflin/job-family/v1/SALES'`,
			sql`UPDATE hcm.job_profile SET code='X' WHERE id='dunder-mifflin/job-profile/ACCOUNTANT'`,
		])
			expect(await sqlState([statement])).toBe('42501')
		// Closing the published version is the one permitted change.
		expect(
			await sqlState([
				sql`UPDATE hcm.job_catalogue_version SET status='Superseded',effective_to='2026-12-31',revision=revision+1 WHERE id=${V1}`,
			]),
		).toBe('ok')
		expect(
			await sqlState([
				sql`UPDATE hcm.job_catalogue_version SET status='Superseded',effective_to='2026-12-31' WHERE id=${V1}`,
				sql`UPDATE hcm.job_catalogue_version SET effective_to='2027-12-31' WHERE id=${V1}`,
			]),
		).toBe('23514')
	})

	it('enforces the catalogue shape on drafts', /** DEC-HCM2-005, DEC-HCM2-006, business rules 4 and 6. */ async () => {
		expect(await sqlState(draft)).toBe('ok')
		const cases: [string, ReturnType<typeof sql>][] = [
			[
				'23514',
				sql`INSERT INTO hcm.job_family(tenant_id,id,job_catalogue_version_id,parent_job_family_id,code,name,depth,materialized_path) VALUES (${TENANT},'v2-child','v2','v2-sales','CHILD','Child',1,'x'),(${TENANT},'v2-grandchild','v2','v2-child','GRANDCHILD','Grandchild',1,'x')`,
			],
			[
				'23505',
				sql`INSERT INTO hcm.career_track(tenant_id,id,job_catalogue_version_id,code,name,kind) VALUES (${TENANT},'v2-ic2','v2','IC_TWO','Second','IndividualContributor')`,
			],
			[
				'23514',
				sql`INSERT INTO hcm.career_track(tenant_id,id,job_catalogue_version_id,code,name,kind) VALUES (${TENANT},'v2-x','v2','SPECIALIST','Specialist','Specialist')`,
			],
			[
				'23505',
				sql`INSERT INTO hcm.job_level(tenant_id,id,job_catalogue_version_id,career_track_id,code,name,sequence_number) VALUES (${TENANT},'l1','v2','v2-ic','IC1','A',1),(${TENANT},'l2','v2','v2-ic','IC2','B',1)`,
			],
			[
				'23505',
				sql`INSERT INTO hcm.job_band(tenant_id,id,job_catalogue_version_id,code,name,sequence_number) VALUES (${TENANT},'v2-entry2','v2','ENTRY','Entry again',2)`,
			],
			[
				'23505',
				sql`INSERT INTO hcm.job_catalogue_version(tenant_id,id,job_catalogue_id,version_number) VALUES (${TENANT},'v3',${CATALOGUE},3)`,
			],
			[
				'23505',
				sql`INSERT INTO hcm.job_catalogue(tenant_id,id,code,name) VALUES (${TENANT},'second','SECOND','Second catalogue')`,
			],
			[
				'23503',
				sql`INSERT INTO hcm.job_grade(tenant_id,id,job_catalogue_version_id,job_band_id,code,name,sequence_number) VALUES (${TENANT},'g','v2','dunder-mifflin/job-band/v1/ENTRY','GX','Grade X',9)`,
			],
		]
		for (const [code, statement] of cases)
			expect(await sqlState([...draft, statement]), String(statement.compile(runtime).sql)).toBe(
				code,
			)
		const derived = await read(
			/** A child's depth and path come from its root parent. */ async (reader, trx) => {
				for (const statement of draft) await statement.execute(trx)
				await sql`INSERT INTO hcm.job_family(tenant_id,id,job_catalogue_version_id,parent_job_family_id,code,name,depth,materialized_path) VALUES (${TENANT},'v2-inside','v2','v2-sales','INSIDE_SALES','Inside Sales',1,'x')`.execute(
					trx,
				)
				return reader.families('v2', { parentId: 'v2-sales', limit: 25 })
			},
		)
		expect(derived.items).toMatchObject([{ depth: 2, path: 'SALES/INSIDE_SALES' }])
	})

	it('publishes without overlapping ranges', /** Business rule 3, REQ-JOB-CATALOGUE-004. */ async () => {
		const review = sql`UPDATE hcm.job_catalogue_version SET status='InReview' WHERE id='v2'`
		/** Publish version 2 from a date. */
		const publish = (from: string) =>
			sql`UPDATE hcm.job_catalogue_version SET status='Published',effective_from=${from}::date,published_at=now(),source_digest=${'a'.repeat(64)} WHERE id='v2'`
		expect(await sqlState([...draft, review, publish('2027-01-01')])).toBe('23P01')
		expect(
			await sqlState([
				...draft,
				review,
				sql`UPDATE hcm.job_catalogue_version SET status='Superseded',effective_to='2026-12-31' WHERE id=${V1}`,
				publish('2027-01-01'),
				sql`UPDATE hcm.job_catalogue SET current_published_version_id='v2' WHERE id=${CATALOGUE}`,
			]),
		).toBe('ok')
		expect(
			await sqlState([
				...draft,
				sql`UPDATE hcm.job_catalogue_version SET status='Published',effective_from='2027-01-01',published_at=now() WHERE id='v2'`,
			]),
		).toBe('23514')
		expect(
			await sqlState([
				...draft,
				review,
				sql`UPDATE hcm.job_catalogue_version SET status='Draft' WHERE id='v2'`,
			]),
		).toBe('23514')
	})

	it('keeps job profile references compatible and complete', /** Business rules 5, 7 and 8. */ async () => {
		const profile = [
			sql`INSERT INTO hcm.job_profile(tenant_id,id,code,name) VALUES (${TENANT},'p','PAPER_EXPERT','Paper expert')`,
			sql`INSERT INTO hcm.job_profile_version(tenant_id,id,job_profile_id,job_catalogue_version_id,job_family_id,career_track_id,job_level_id,version_number) VALUES (${TENANT},'pv','p',${V1},'dunder-mifflin/job-family/v1/INSIDE_SALES','dunder-mifflin/career-track/v1/IC','dunder-mifflin/job-level/v1/IC1',1)`,
		]
		/** Allow a grade of version 1. */
		const grade = (code: string, isDefault: boolean) =>
			sql`INSERT INTO hcm.job_profile_grade(tenant_id,id,job_profile_version_id,job_catalogue_version_id,job_grade_id,is_default) VALUES (${TENANT},${'pg-' + code},'pv',${V1},${'dunder-mifflin/job-grade/v1/' + code},${isDefault})`
		const submit = sql`UPDATE hcm.job_profile_version SET status='InReview' WHERE id='pv'`
		expect(await sqlState([...profile, grade('G1', true), grade('G2', false), submit], true)).toBe(
			'ok',
		)
		expect(await sqlState([...profile, grade('G1', false), submit], true)).toBe('23514')
		expect(await sqlState([...profile, submit], true)).toBe('23514')
		expect(await sqlState([...profile, grade('G1', true), grade('G2', true)])).toBe('23505')
		// A level of another track, and a grade of another catalogue version, are refused.
		expect(
			await sqlState([
				profile[0],
				sql`INSERT INTO hcm.job_profile_version(tenant_id,id,job_profile_id,job_catalogue_version_id,job_family_id,career_track_id,job_level_id,version_number) VALUES (${TENANT},'pv','p',${V1},'dunder-mifflin/job-family/v1/INSIDE_SALES','dunder-mifflin/career-track/v1/IC','dunder-mifflin/job-level/v1/M1',1)`,
			]),
		).toBe('23503')
		expect(
			await sqlState([
				...draft,
				...profile,
				sql`INSERT INTO hcm.job_band(tenant_id,id,job_catalogue_version_id,code,name,sequence_number) VALUES (${TENANT},'v2-b','v2','EXTRA','Extra',2)`,
				sql`INSERT INTO hcm.job_grade(tenant_id,id,job_catalogue_version_id,job_band_id,code,name,sequence_number) VALUES (${TENANT},'v2-g','v2','v2-b','GX','GX',1)`,
				sql`INSERT INTO hcm.job_profile_grade(tenant_id,id,job_profile_version_id,job_catalogue_version_id,job_grade_id,is_default) VALUES (${TENANT},'pg','pv','v2','v2-g',true)`,
			]),
		).toBe('23503')
		// A profile version of a draft catalogue cannot leave draft.
		expect(
			await sqlState(
				[
					...draft,
					sql`INSERT INTO hcm.job_level(tenant_id,id,job_catalogue_version_id,career_track_id,code,name,sequence_number) VALUES (${TENANT},'v2-l','v2','v2-ic','IC1','A',1)`,
					sql`INSERT INTO hcm.job_grade(tenant_id,id,job_catalogue_version_id,job_band_id,code,name,sequence_number) VALUES (${TENANT},'v2-g','v2','v2-entry','G1','G1',1)`,
					profile[0],
					sql`INSERT INTO hcm.job_profile_version(tenant_id,id,job_profile_id,job_catalogue_version_id,job_family_id,career_track_id,job_level_id,version_number) VALUES (${TENANT},'pv','p','v2','v2-sales','v2-ic','v2-l',1)`,
					sql`INSERT INTO hcm.job_profile_grade(tenant_id,id,job_profile_version_id,job_catalogue_version_id,job_grade_id,is_default) VALUES (${TENANT},'pg','pv','v2','v2-g',true)`,
					submit,
				],
				true,
			),
		).toBe('23514')
		/** One requirement row. */
		const requirement = (quantity: string, unit: string) =>
			sql`INSERT INTO hcm.job_profile_requirement(tenant_id,id,job_profile_version_id,requirement_code,requirement_type,name,minimum_quantity,quantity_unit) VALUES (${TENANT},'q','pv','EXP','Experience','Experience',${sql.raw(quantity)},${sql.raw(unit)})`
		expect(await sqlState([...profile, requirement('2', "'Years'")])).toBe('ok')
		expect(await sqlState([...profile, requirement('-1', "'Years'")])).toBe('23514')
		expect(await sqlState([...profile, requirement('2', 'NULL')])).toBe('23514')
		expect(await sqlState([...profile, requirement('NULL', "'Years'")])).toBe('23514')
	})

	it('isolates tenants and grants no reads to other tenants', /** RLS. */ async () => {
		const other = await read(
			/** Read as another tenant. */ async (reader) => ({
				catalogue: await reader.catalogue(),
				profiles: await reader.profiles({ q: '', limit: 25 }),
				version: await reader.version(V1),
			}),
			'local-other-tenant',
		)
		expect(other).toEqual({
			catalogue: undefined,
			profiles: { items: [], nextCursor: null },
			version: undefined,
		})
		const rls = await admin.query(
			"SELECT count(*)::int AS n FROM pg_class WHERE relnamespace='hcm'::regnamespace AND (relname LIKE 'job_%' OR relname='career_track') AND relkind='r' AND relrowsecurity AND relforcerowsecurity",
		)
		expect(rls.rows[0]?.n).toBe(13)
	})
})
