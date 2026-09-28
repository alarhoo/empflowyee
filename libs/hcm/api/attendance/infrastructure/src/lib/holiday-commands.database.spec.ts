import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { Client } from 'pg'
import {
	HcmRuntimeApplication,
	type AuthenticatedHcmContext,
	type FieldCipher,
} from '@empflowyee/hcm-api-runtime-application'
import {
	HcmRuntimeStore,
	createSessionReader,
	createTenantDirectory,
	LocalFieldCipher,
	UnavailableFieldCipher,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import { migrateHcmDatabase, loadSqlMigrations } from '@empflowyee/hcm-api-database-migrations'
import { runDevelopmentSeeds } from '@empflowyee/hcm-api-database-seed'
import { AttendanceHolidayDrafts, holidayDraftOf } from '@empflowyee/hcm-api-attendance-application'
import type { HolidayDraft, HolidayVersionView } from '@empflowyee/hcm-attendance-contract'
import { KyselyAttendanceHolidayUnit } from './holiday-unit'

const tenant = 'local-dunder-mifflin'
const cipher = new LocalFieldCipher(randomBytes(32))
const env = {
	APP_ENVIRONMENT: 'local',
	NODE_ENV: 'test',
	HCM_LOCAL_TENANTS: 'true',
	HCM_LOCAL_SESSION: 'true',
}
let admin: Client,
	access: HcmAccessDatabase,
	store: HcmRuntimeStore,
	authentication: HcmRuntimeApplication,
	commands: AttendanceHolidayDrafts
let david: AuthenticatedHcmContext, toby: AuthenticatedHcmContext

/** Supply explicit test-only dates, including a deliberately different actual date and exact partial interval. */
function draft(): HolidayDraft {
	return {
		code: 'H_' + randomUUID().slice(0, 8).toUpperCase(),
		name: 'Explicit calendar',
		effectiveFrom: '2026-01-01',
		effectiveTo: '2026-12-31',
		entries: [
			{
				date: '2025-12-31',
				observedDate: '2026-01-02',
				category: 'Substitute',
				name: 'Explicit observed day',
				priority: 7,
			},
			{
				date: '2026-11-01',
				observedDate: '2026-11-01',
				category: 'Regional',
				name: 'Partial regional date',
				priority: -1,
				regionCode: 'US-PA',
				startTime: '01:00:01.125',
				endTime: '02:00:00.250',
				overlapOffset: { start: 'Later' },
			},
		],
	}
}
/** Authenticate only canonical persisted actors through the real local session boundary. */
async function context(persona: string): Promise<AuthenticatedHcmContext> {
	return authentication.authenticate(
		await authentication.resolveTenant('acme.localhost', '127.0.0.1'),
		undefined,
		{ peerAddress: '127.0.0.1', developmentPersona: persona },
	)
}
/** Arrange immutable published input for successor tests; this is not a publication implementation. */
async function source(): Promise<HolidayVersionView> {
	const value = await commands.create(david, randomUUID(), draft())
	await admin.query(
		"UPDATE hcm.holiday_calendar_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id='dunder-mifflin/account/david',publication_digest=repeat('a',64) WHERE tenant_id=$1 AND id=$2",
		[tenant, value.versionId],
	)
	return commands.read(david, value.id, value.versionId)
}
/** Count committed effects by original request key without returning private reason values. */
async function evidence(key: string): Promise<{ receipts: number; audits: number }> {
	return (
		await admin.query(
			'SELECT (SELECT count(*)::int FROM hcm.attendance_command_receipt WHERE tenant_id=$1 AND idempotency_key=$2::uuid) AS receipts,(SELECT count(*)::int FROM hcm.audit_event WHERE tenant_id=$1 AND request_id=$2::text) AS audits',
			[tenant, key],
		)
	).rows[0]
}

beforeAll(
	/** Migrate isolated PostgreSQL and seed canonical subjects, then grant only the tested calendar operations. */ async () => {
		const migrator = process.env['HCM_TEST_MIGRATOR'],
			runtime = process.env['HCM_TEST_RUNTIME']
		if (!migrator || !runtime) throw new Error('Disposable database required')
		admin = new Client({ connectionString: migrator })
		await admin.connect()
		await admin.query('DROP SCHEMA IF EXISTS hcm CASCADE')
		const inventory = resolve('libs/hcm/api/database/migrations/sql')
		await migrateHcmDatabase(migrator, inventory)
		await runDevelopmentSeeds({
			env: { ...env, HCM_SEED_TARGET: tenant, HCM_SEED_DATABASE_URL: migrator },
			manifestDirectory: resolve('libs/hcm/api/database/seed/manifest'),
			migrations: await loadSqlMigrations(inventory),
		})
		await admin.query("SELECT set_config('hcm.tenant_id',$1,false)", [tenant])
		for (const operation of ['draft', 'read']) {
			const permission = 'hcm.attendance.holiday-calendars.' + operation
			await admin.query(
				"INSERT INTO hcm.access_permission(tenant_id,code,description,kind) VALUES($1,$2,'Holiday test operation','business-operation')",
				[tenant, permission],
			)
			await admin.query(
				"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'tenant-administrator',$2)",
				[tenant, permission],
			)
		}
		store = new HcmRuntimeStore(runtime)
		authentication = new HcmRuntimeApplication(
			createTenantDirectory(env, store),
			createSessionReader(env, store),
		)
		access = new HcmAccessDatabase(runtime)
		commands = new AttendanceHolidayDrafts(new KyselyAttendanceHolidayUnit(access, cipher))
		david = await context('david')
		toby = await context('toby')
		await admin.query('BEGIN')
		try {
			await admin.query("SELECT set_config('hcm.tenant_id','holiday-foreign',true)")
			await admin.query(
				"INSERT INTO hcm.tenant(id,slug,display_name,status) VALUES('holiday-foreign','holiday-foreign','Other tenant','active')",
			)
			await admin.query(
				"INSERT INTO hcm.person(tenant_id,id,given_name,family_name,display_name) VALUES('holiday-foreign','foreign-person','Other','Actor','Other Actor')",
			)
			await admin.query(
				"INSERT INTO hcm.user_account(tenant_id,id,person_id,email) VALUES('holiday-foreign','foreign-actor','foreign-person','other@example.test')",
			)
			await admin.query(
				"INSERT INTO hcm.holiday_calendar(tenant_id,id,code,created_by_account_id) VALUES('holiday-foreign','foreign-calendar','FOREIGN_ONLY','foreign-actor')",
			)
			await admin.query(
				"INSERT INTO hcm.holiday_calendar_version(tenant_id,id,calendar_id,version_number,name,effective_from,created_by_account_id) VALUES('holiday-foreign','foreign-version','foreign-calendar',1,'Private holidays','2026-01-01','foreign-actor')",
			)
			await admin.query('COMMIT')
		} catch (error) {
			await admin.query('ROLLBACK')
			throw error
		}
	},
)
afterAll(
	/** Close only pools and fixture connections owned by this disposable suite. */ async () => {
		await access?.onApplicationShutdown()
		await store?.onApplicationShutdown()
		await admin?.end()
	},
)

it('creates once under concurrent retry and preserves exact explicit holiday content', /** Real runtime SQL, audit and receipts must agree on one source result. */ async () => {
	const input = draft(),
		key = randomUUID()
	const values = await Promise.all([
		commands.create(david, key, input),
		commands.create(david, key, input),
	])
	expect(values[0]).toEqual(values[1])
	expect(await evidence(key)).toEqual({ receipts: 1, audits: 1 })
	expect(values[0].entries[0]).toEqual(input.entries[0])
	expect(values[0].entries[1]).toMatchObject({
		startTime: '01:00:01.125',
		endTime: '02:00:00.25',
		overlapOffset: { start: 'Later' },
	})
	expect(values[0].state).toBe('Draft')
	await expect(
		commands.create(david, key, { ...input, name: 'Changed retry' }),
	).rejects.toMatchObject({ code: 'idempotency-conflict' })
	await expect(commands.create(david, randomUUID(), input)).rejects.toMatchObject({
		code: 'duplicate-code',
	})
})

it('replaces only the current editable revision and rolls back failed child replacement', /** Stale, invalid-reference and immutable-root changes cannot lose the existing holiday evidence. */ async () => {
	const created = await commands.create(david, randomUUID(), draft())
	const input = {
		...holidayDraftOf(created),
		name: 'Edited draft',
		expectedRevision: created.revision,
	}
	const saved = await commands.update(david, created.id, created.versionId, randomUUID(), input)
	expect(saved.revision).toBe(2)
	await expect(
		commands.update(david, created.id, created.versionId, randomUUID(), input),
	).rejects.toMatchObject({ code: 'revision-conflict' })
	await expect(
		commands.update(david, created.id, created.versionId, randomUUID(), {
			...input,
			expectedRevision: 2,
			code: 'CHANGED_ROOT',
		}),
	).rejects.toMatchObject({ code: 'field-not-editable' })
	const key = randomUUID()
	await expect(
		commands.update(david, created.id, created.versionId, key, {
			...input,
			expectedRevision: 2,
			entries: [{ ...input.entries[0], locationId: 'missing-location' }],
		}),
	).rejects.toMatchObject({ code: 'invalid-request' })
	expect(await commands.read(david, created.id, created.versionId)).toEqual(saved)
	expect(await evidence(key)).toEqual({ receipts: 0, audits: 0 })
	await expect(
		commands.newVersion(david, created.id, randomUUID(), {
			sourceVersionId: created.versionId,
			expectedRevision: 2,
			reason: 'Cannot version a Draft',
		}),
	).rejects.toMatchObject({ code: 'invalid-state' })
})

it('versions published content independently with encrypted reason and immutable supersession', /** Editing the successor cannot change the referenced calendar or its original observed dates. */ async () => {
	const current = await source(),
		key = randomUUID()
	const input = {
		sourceVersionId: current.versionId,
		expectedRevision: current.revision,
		reason: ' Private successor rationale ',
	}
	const next = await commands.newVersion(david, current.id, key, input)
	expect(next).toMatchObject({
		id: current.id,
		state: 'Draft',
		revision: 1,
		versionNumber: 2,
		entries: current.entries,
	})
	expect(await commands.newVersion(david, current.id, key, input)).toEqual(next)
	await commands.update(david, next.id, next.versionId, randomUUID(), {
		...holidayDraftOf(next),
		expectedRevision: 1,
		entries: [],
	})
	expect(await commands.read(david, current.id, current.versionId)).toEqual(current)
	await expect(
		commands.update(david, current.id, current.versionId, randomUUID(), {
			...holidayDraftOf(current),
			expectedRevision: current.revision,
		}),
	).rejects.toMatchObject({ code: 'version-published' })
	const row = (
		await admin.query(
			'SELECT supersedes_id FROM hcm.holiday_calendar_version WHERE tenant_id=$1 AND id=$2',
			[tenant, next.versionId],
		)
	).rows[0]
	expect(row.supersedes_id).toBe(current.versionId)
	const stored = (
		await admin.query(
			'SELECT encrypted_reason IS NOT NULL AS encrypted,holiday_calendar_version_id,response FROM hcm.attendance_command_receipt WHERE tenant_id=$1 AND idempotency_key=$2',
			[tenant, key],
		)
	).rows[0]
	expect(stored.encrypted).toBe(true)
	expect(stored.holiday_calendar_version_id).toBe(next.versionId)
	expect(JSON.stringify(stored.response)).not.toContain(input.reason)
	expect(await evidence(key)).toEqual({ receipts: 1, audits: 1 })
})

it('denies foreign roots, missing grants, scoped-only authority and revoked read replay', /** Neither an old session projection nor source identity bypasses current operation authority. */ async () => {
	await expect(commands.read(david, 'foreign-calendar', 'foreign-version')).rejects.toMatchObject({
		code: 'not-found',
	})
	await expect(
		commands.update(david, 'foreign-calendar', 'foreign-version', randomUUID(), {
			...draft(),
			expectedRevision: 1,
		}),
	).rejects.toMatchObject({ code: 'not-found' })
	await expect(commands.create(toby, randomUUID(), draft())).rejects.toMatchObject({
		code: 'forbidden',
	})
	await expect(
		commands.create({ session: david.session }, randomUUID(), draft()),
	).rejects.toMatchObject({ code: 'unauthenticated' })
	await admin.query(
		"INSERT INTO hcm.access_role(tenant_id,id,label) VALUES($1,'holiday-scoped','Scoped calendar')",
		[tenant],
	)
	await admin.query(
		"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'holiday-scoped','hcm.attendance.holiday-calendars.draft')",
		[tenant],
	)
	await admin.query(
		"INSERT INTO hcm.account_role(tenant_id,account_id,role_id,grant_id) VALUES($1,'dunder-mifflin/account/toby','holiday-scoped','holiday-scoped-grant')",
		[tenant],
	)
	await admin.query(
		"INSERT INTO hcm.account_role_scope(tenant_id,id,grant_id,scope_kind,employment_id) VALUES($1,'holiday-scope','holiday-scoped-grant','Employment','dunder-mifflin/employment/jim')",
		[tenant],
	)
	await expect(commands.create(toby, randomUUID(), draft())).rejects.toMatchObject({
		code: 'forbidden',
	})
	const input = draft(),
		key = randomUUID()
	await commands.create(david, key, input)
	await admin.query(
		"DELETE FROM hcm.role_permission WHERE tenant_id=$1 AND role_id='tenant-administrator' AND permission_code='hcm.attendance.holiday-calendars.read'",
		[tenant],
	)
	try {
		await expect(commands.create(david, key, input)).rejects.toMatchObject({ code: 'forbidden' })
	} finally {
		await admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'tenant-administrator','hcm.attendance.holiday-calendars.read')",
			[tenant],
		)
	}
	await admin.query(
		"UPDATE hcm.tenant_entitlement SET enabled=false WHERE tenant_id=$1 AND code='hcm.attendance'",
		[tenant],
	)
	try {
		await expect(commands.create(david, randomUUID(), draft())).rejects.toMatchObject({
			code: 'forbidden',
		})
	} finally {
		await admin.query(
			"UPDATE hcm.tenant_entitlement SET enabled=true WHERE tenant_id=$1 AND code='hcm.attendance'",
			[tenant],
		)
	}
})

it('rolls back successor, audit and receipt on encryption failure or session expiry', /** Both failures happen after SQL effects and must leave the immutable source as the only version. */ async () => {
	const current = await source(),
		input = {
			sourceVersionId: current.versionId,
			expectedRevision: current.revision,
			reason: 'Private reason',
		}
	const unavailable = new AttendanceHolidayDrafts(
		new KyselyAttendanceHolidayUnit(access, new UnavailableFieldCipher()),
	)
	const failedKey = randomUUID()
	await expect(unavailable.newVersion(david, current.id, failedKey, input)).rejects.toThrow(
		'Field encryption is not configured',
	)
	expect(await evidence(failedKey)).toEqual({ receipts: 0, audits: 0 })
	const expiresAt = david.session.session.expiresAt
	if (!expiresAt) throw new Error('Expiring authenticated session required')
	const clock = vi.spyOn(Date, 'now')
	const expiringCipher: FieldCipher = {
		/** Use real encryption and move only the test clock after sealing. */
		bind(transaction, tenantId) {
			const bound = cipher.bind(transaction, tenantId)
			return {
				...bound,
				encrypt: /** Expire the actor after awaited private evidence work. */ async (
					target,
					value,
				) => {
					const sealed = await bound.encrypt(target, value)
					clock.mockReturnValue(Date.parse(expiresAt) + 1)
					return sealed
				},
			}
		},
	}
	const expiredKey = randomUUID()
	try {
		await expect(
			new AttendanceHolidayDrafts(
				new KyselyAttendanceHolidayUnit(access, expiringCipher),
			).newVersion(david, current.id, expiredKey, input),
		).rejects.toMatchObject({ code: 'unauthenticated' })
	} finally {
		clock.mockRestore()
	}
	expect(await evidence(expiredKey)).toEqual({ receipts: 0, audits: 0 })
	expect(
		(
			await admin.query(
				'SELECT id FROM hcm.holiday_calendar_version WHERE tenant_id=$1 AND calendar_id=$2',
				[tenant, current.id],
			)
		).rows,
	).toEqual([{ id: current.versionId }])
})
