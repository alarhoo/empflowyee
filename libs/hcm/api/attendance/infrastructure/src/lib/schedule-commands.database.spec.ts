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
import {
	AttendanceScheduleDrafts,
	AttendanceTemplatePublication,
} from '@empflowyee/hcm-api-attendance-application'
import type {
	ScheduleDraft,
	ScheduleSegment,
	ScheduleVersionView,
} from '@empflowyee/hcm-attendance-contract'
import { KyselyAttendanceScheduleUnit } from './schedule-unit'

const tenant = 'local-dunder-mifflin'
const localCipher = new LocalFieldCipher(randomBytes(32))
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
	commands: AttendanceScheduleDrafts
let publication: AttendanceTemplatePublication
let david: AuthenticatedHcmContext, toby: AuthenticatedHcmContext

/** Produce a complete test-only template with deliberate break placement, never an automatically published default. */
function draft(code = 'T_' + randomUUID().slice(0, 8).toUpperCase()): ScheduleDraft {
	const segments: ScheduleSegment[] = [
		{ startTime: '09:00', endTime: '12:00', endDayOffset: 0, kind: 'Work' },
		{ startTime: '12:00', endTime: '13:00', endDayOffset: 0, kind: 'UnpaidBreak' },
		{ startTime: '13:00', endTime: '18:00', endDayOffset: 0, kind: 'Work' },
	]
	return {
		code,
		name: 'Explicit test template',
		isTemplate: true,
		effectiveFrom: '2026-01-01',
		timezoneMode: 'Fixed',
		fixedZone: 'America/New_York',
		weekStartsOn: 1,
		days: Array.from(
			{ length: 7 },
			/** Declare all weekdays explicitly, including weekly rest. */ (_, index) => ({
				weekday: index + 1,
				kind: index < 5 ? 'Work' : 'Rest',
				segments: index < 5 ? structuredClone(segments) : [],
			}),
		),
	}
}

/** Resolve a real persisted development persona through the existing local authentication boundary. */
async function context(persona: string): Promise<AuthenticatedHcmContext> {
	const tenantRecord = await authentication.resolveTenant('acme.localhost', '127.0.0.1')
	return authentication.authenticate(tenantRecord, undefined, {
		peerAddress: '127.0.0.1',
		developmentPersona: persona,
	})
}

/** Arrange immutable source publication directly in test SQL; publication use cases are a separate slice. */
async function publishedTemplate(): Promise<ScheduleVersionView> {
	const created = await commands.create(david, 'Templates', randomUUID(), draft())
	await admin.query(
		"UPDATE hcm.work_schedule_version SET state='Published',revision=revision+1,published_at=now(),published_by_account_id='dunder-mifflin/account/david',publication_digest=repeat('a',64) WHERE tenant_id=$1 AND id=$2",
		[tenant, created.versionId],
	)
	return { ...created, revision: created.revision + 1, state: 'Published' }
}

beforeAll(
	/** Migrate isolated PostgreSQL, seed canonical actors and grant only the operations exercised by this foundation suite. */ async () => {
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
		for (const app of ['work-schedules']) {
			for (const operation of ['draft', 'read']) {
				const permission = `hcm.attendance.${app}.${operation}`
				await admin.query(
					"INSERT INTO hcm.access_permission(tenant_id,code,description,kind) VALUES($1,$2,'Attendance test operation','business-operation')",
					[tenant, permission],
				)
				await admin.query(
					"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'tenant-administrator',$2)",
					[tenant, permission],
				)
			}
		}
		store = new HcmRuntimeStore(runtime)
		authentication = new HcmRuntimeApplication(
			createTenantDirectory(env, store),
			createSessionReader(env, store),
		)
		access = new HcmAccessDatabase(runtime)
		commands = new AttendanceScheduleDrafts(new KyselyAttendanceScheduleUnit(access, localCipher))
		publication = new AttendanceTemplatePublication(
			new KyselyAttendanceScheduleUnit(access, localCipher),
		)
		david = await context('david')
		toby = await context('toby')
	},
)

afterAll(
	/** Close all restricted runtime pools and fixture connections. */ async () => {
		await access?.onApplicationShutdown()
		await store?.onApplicationShutdown()
		await admin?.end()
	},
)

/** Create a real Draft and actor-bound preview through application commands, without fixture publication SQL. */
async function readyTemplate() {
	const source = await commands.create(david, 'Templates', randomUUID(), draft())
	const preview = await publication.preview(david, source.id, source.versionId, randomUUID(), {
		expectedRevision: 1,
		effectiveFrom: source.effectiveFrom,
	})
	return {
		source,
		preview,
		input: {
			expectedRevision: 1,
			previewId: preview.previewId,
			digest: preview.digest,
			reason: ' Reviewed reusable pattern ',
		},
	}
}

it('publishes and retires reusable patterns with atomic actor-bound preview consumption', /** Concurrent retries yield one lifecycle change while independent copies preserve source attribution. */ async () => {
	const { source, preview, input } = await readyTemplate()
	expect(preview).toMatchObject({
		state: 'Ready',
		affectedEmploymentCount: 0,
		affectedWorkdayCount: 0,
		conflicts: 0,
		lockedImpact: false,
		inputRevisions: [{ sourceType: 'Schedule', id: source.versionId, revision: 1 }],
	})
	const key = randomUUID()
	const results = await Promise.all([
		publication.publish(david, source.id, source.versionId, key, input),
		publication.publish(david, source.id, source.versionId, key, input),
	])
	expect(results[0]).toEqual(results[1])
	expect(results[0]).toMatchObject({ revision: 2, state: 'Published' })
	await expect(
		publication.publish(david, source.id, source.versionId, key, {
			...input,
			reason: 'Changed retry',
		}),
	).rejects.toMatchObject({ code: 'idempotency-conflict' })
	const evidence = await admin.query(
		'SELECT state,revision FROM hcm.time_configuration_impact_preview WHERE tenant_id=$1 AND id=$2',
		[tenant, preview.previewId],
	)
	expect(evidence.rows).toEqual([{ state: 'Consumed', revision: 2 }])
	const copy = await commands.copyTemplate(david, source.id, randomUUID(), {
		sourceVersionId: source.versionId,
		expectedRevision: 2,
		code: 'LIFECYCLE_COPY',
		name: 'Independent copy',
		reason: 'Use published pattern',
	})
	const retireKey = randomUUID()
	const retired = await publication.retire(david, source.id, source.versionId, retireKey, {
		expectedRevision: 2,
		reason: 'Retire future selection',
	})
	expect(retired).toMatchObject({ revision: 3, state: 'Retired' })
	expect(
		await publication.retire(david, source.id, source.versionId, retireKey, {
			expectedRevision: 2,
			reason: 'Retire future selection',
		}),
	).toEqual(retired)
	expect(
		(
			await admin.query(
				'SELECT state,revision,copied_from_id FROM hcm.work_schedule_version WHERE tenant_id=$1 AND id=$2',
				[tenant, copy.versionId],
			)
		).rows,
	).toEqual([{ state: 'Draft', revision: 1, copied_from_id: source.versionId }])
	await expect(
		commands.copyTemplate(david, source.id, randomUUID(), {
			sourceVersionId: source.versionId,
			expectedRevision: 3,
			code: 'LATE_COPY',
			name: 'Denied copy',
			reason: 'Too late',
		}),
	).rejects.toMatchObject({ code: 'invalid-state' })
})

it('rejects wrong-source, modified-source and expired preview evidence', /** A valid-looking preview identifier never substitutes for exact immutable source input and database time. */ async () => {
	const { source, preview, input } = await readyTemplate()
	const other = await commands.create(david, 'Templates', randomUUID(), draft())
	await expect(
		publication.publish(david, other.id, other.versionId, randomUUID(), input),
	).rejects.toMatchObject({ code: 'preview-stale' })
	await expect(
		publication.publish(david, source.id, source.versionId, randomUUID(), {
			...input,
			digest: 'b'.repeat(64),
		}),
	).rejects.toMatchObject({ code: 'preview-stale' })
	// Preserve real source and actor evidence while arranging a historical expired preview fixture.
	const expiredId = randomUUID()
	await admin.query(
		"INSERT INTO hcm.time_configuration_impact_preview(tenant_id,id,actor_account_id,work_schedule_version_id,source_revision,source_digest,from_date,to_date,state,input_revisions,result_digest,affected_employment_count,affected_workday_count,conflict_count,locked_impact,created_at,expires_at) SELECT tenant_id,$3,actor_account_id,work_schedule_version_id,source_revision,source_digest,from_date,to_date,state,input_revisions,result_digest,affected_employment_count,affected_workday_count,conflict_count,locked_impact,now()-interval '30 minutes',now()-interval '15 minutes' FROM hcm.time_configuration_impact_preview WHERE tenant_id=$1 AND id=$2",
		[tenant, preview.previewId, expiredId],
	)
	await expect(
		publication.publish(david, source.id, source.versionId, randomUUID(), {
			...input,
			previewId: expiredId,
		}),
	).rejects.toMatchObject({ code: 'preview-stale' })
	await commands.update(david, 'Templates', source.id, source.versionId, randomUUID(), {
		...draft(source.code),
		expectedRevision: 1,
		name: 'Changed after preview',
	})
	await expect(
		publication.publish(david, source.id, source.versionId, randomUUID(), input),
	).rejects.toMatchObject({ code: 'revision-conflict' })
	await expect(
		publication.publish(david, source.id, source.versionId, randomUUID(), {
			...input,
			expectedRevision: 2,
		}),
	).rejects.toMatchObject({ code: 'preview-stale' })
	expect(
		(
			await admin.query(
				'SELECT state FROM hcm.time_configuration_impact_preview WHERE tenant_id=$1 AND id=$2',
				[tenant, preview.previewId],
			)
		).rows[0].state,
	).toBe('Ready')
})

it('requires publication permission and the preview actor even when another actor has identical grants', /** Tenant-wide authority does not transfer a reviewed preview between authenticated people. */ async () => {
	const { source, input } = await readyTemplate()
	await expect(
		publication.publish(toby, source.id, source.versionId, randomUUID(), input),
	).rejects.toMatchObject({ code: 'forbidden' })
	await admin.query(
		"INSERT INTO hcm.account_role(tenant_id,account_id,role_id,grant_id) VALUES($1,'dunder-mifflin/account/toby','tenant-administrator','publication-test-grant')",
		[tenant],
	)
	try {
		await expect(
			publication.publish(toby, source.id, source.versionId, randomUUID(), input),
		).rejects.toMatchObject({ code: 'preview-stale' })
	} finally {
		await admin.query(
			"DELETE FROM hcm.account_role WHERE tenant_id=$1 AND grant_id='publication-test-grant'",
			[tenant],
		)
	}
	const permission = 'hcm.attendance.work-schedule-templates.publish'
	await admin.query(
		"DELETE FROM hcm.role_permission WHERE tenant_id=$1 AND role_id='tenant-administrator' AND permission_code=$2",
		[tenant, permission],
	)
	try {
		await expect(
			publication.publish(david, source.id, source.versionId, randomUUID(), input),
		).rejects.toMatchObject({ code: 'forbidden' })
	} finally {
		await admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'tenant-administrator',$2)",
			[tenant, permission],
		)
	}
})

it('rolls back publication and preview consumption when encrypted command evidence fails', /** The same reviewed preview and idempotency key remain usable after a pre-commit failure. */ async () => {
	const { source, preview, input } = await readyTemplate()
	const key = randomUUID()
	const unavailable = new AttendanceTemplatePublication(
		new KyselyAttendanceScheduleUnit(access, new UnavailableFieldCipher()),
	)
	await expect(unavailable.publish(david, source.id, source.versionId, key, input)).rejects.toThrow(
		'Field encryption is not configured',
	)
	expect(
		(
			await admin.query(
				'SELECT state,revision FROM hcm.work_schedule_version WHERE tenant_id=$1 AND id=$2',
				[tenant, source.versionId],
			)
		).rows,
	).toEqual([{ state: 'Draft', revision: 1 }])
	expect(
		(
			await admin.query(
				'SELECT state,revision FROM hcm.time_configuration_impact_preview WHERE tenant_id=$1 AND id=$2',
				[tenant, preview.previewId],
			)
		).rows,
	).toEqual([{ state: 'Ready', revision: 1 }])
	expect(
		(
			await admin.query('SELECT id FROM hcm.audit_event WHERE tenant_id=$1 AND request_id=$2', [
				tenant,
				key,
			])
		).rows,
	).toEqual([])
	expect(
		(
			await admin.query(
				'SELECT id FROM hcm.attendance_command_receipt WHERE tenant_id=$1 AND idempotency_key=$2',
				[tenant, key],
			)
		).rows,
	).toEqual([])
	expect(await publication.publish(david, source.id, source.versionId, key, input)).toMatchObject({
		state: 'Published',
		revision: 2,
	})
})

it('rejects non-template publication, invalid lifecycle and out-of-coverage previews', /** Pattern curation cannot bypass ordinary schedule impact validation or retire an unpublished draft. */ async () => {
	const source = await commands.create(david, 'Schedules', randomUUID(), {
		...draft(),
		isTemplate: false,
	})
	await expect(
		publication.preview(david, source.id, source.versionId, randomUUID(), {
			expectedRevision: 1,
			effectiveFrom: source.effectiveFrom,
		}),
	).rejects.toMatchObject({ code: 'not-found' })
	const template = await commands.create(david, 'Templates', randomUUID(), {
		...draft(),
		effectiveTo: '2026-12-31',
	})
	await expect(
		publication.retire(david, template.id, template.versionId, randomUUID(), {
			expectedRevision: 1,
			reason: 'Cannot retire Draft',
		}),
	).rejects.toMatchObject({ code: 'invalid-state' })
	await expect(
		publication.preview(david, template.id, template.versionId, randomUUID(), {
			expectedRevision: 1,
			effectiveFrom: '2025-12-31',
		}),
	).rejects.toMatchObject({ code: 'effective-date-out-of-range' })
	await expect(
		publication.preview(david, template.id, template.versionId, randomUUID(), {
			expectedRevision: 1,
			effectiveFrom: '2026-12-31',
			effectiveTo: '2027-01-01',
		}),
	).rejects.toMatchObject({ code: 'effective-date-out-of-range' })
})

it('creates and revises a real Draft with one receipt and safe audit per accepted command', /** Concurrent retry, immutable root identity and stale revisions all pass through current authorization. */ async () => {
	const input = draft(),
		key = randomUUID()
	const [created, repeated] = await Promise.all([
		commands.create(david, 'Templates', key, input),
		commands.create(david, 'Templates', key, input),
	])
	expect(repeated).toEqual(created)
	expect(created).toMatchObject({ code: input.code, state: 'Draft', revision: 1 })
	expect(created.days[0].segments).toHaveLength(3)
	expect(
		(
			await admin.query('SELECT id FROM hcm.audit_event WHERE tenant_id=$1 AND request_id=$2', [
				tenant,
				key,
			])
		).rows,
	).toHaveLength(1)
	await expect(
		commands.create(david, 'Templates', key, { ...input, name: 'Changed input' }),
	).rejects.toMatchObject({ code: 'idempotency-conflict' })
	const changed = await commands.update(
		david,
		'Templates',
		created.id,
		created.versionId,
		randomUUID(),
		{ ...input, name: 'Revised draft', expectedRevision: 1 },
	)
	expect(changed).toMatchObject({ revision: 2, name: 'Revised draft' })
	await expect(
		commands.update(david, 'Templates', created.id, created.versionId, randomUUID(), {
			...input,
			expectedRevision: 1,
		}),
	).rejects.toMatchObject({ code: 'revision-conflict' })
	await expect(
		commands.update(david, 'Templates', created.id, created.versionId, randomUUID(), {
			...input,
			code: 'CHANGED_IDENTITY',
			expectedRevision: 2,
		}),
	).rejects.toMatchObject({ code: 'field-not-editable' })
})

it('copies immutable template content independently and rejects reuse after retirement', /** Source attribution survives while changes to the independent draft cannot alter its template. */ async () => {
	const source = await publishedTemplate()
	const copy = await commands.copyTemplate(david, source.id, randomUUID(), {
		sourceVersionId: source.versionId,
		expectedRevision: source.revision,
		code: 'COPY_' + randomUUID().slice(0, 8).toUpperCase(),
		name: 'Independent schedule',
		reason: 'Private copy rationale',
	})
	expect(copy).toMatchObject({
		isTemplate: false,
		state: 'Draft',
		copiedFromVersionId: source.versionId,
	})
	const updated = await commands.update(david, 'Schedules', copy.id, copy.versionId, randomUUID(), {
		...draft(copy.code),
		name: 'Changed independent copy',
		isTemplate: false,
		expectedRevision: copy.revision,
	})
	expect(updated.name).toBe('Changed independent copy')
	expect(
		(
			await admin.query('SELECT name FROM hcm.work_schedule_version WHERE tenant_id=$1 AND id=$2', [
				tenant,
				source.versionId,
			])
		).rows[0].name,
	).toBe(source.name)
	const successor = await commands.newVersion(david, 'Templates', source.id, randomUUID(), {
		sourceVersionId: source.versionId,
		expectedRevision: source.revision,
		reason: 'New template draft',
	})
	expect(successor).toMatchObject({ versionNumber: 2, state: 'Draft', revision: 1 })
	await admin.query(
		"UPDATE hcm.work_schedule_version SET state='Retired',revision=revision+1 WHERE tenant_id=$1 AND id=$2",
		[tenant, source.versionId],
	)
	await expect(
		commands.copyTemplate(david, source.id, randomUUID(), {
			sourceVersionId: source.versionId,
			expectedRevision: source.revision + 1,
			code: 'RETIRED_COPY',
			name: 'No copy',
			reason: 'Must reject retired source',
		}),
	).rejects.toMatchObject({ code: 'invalid-state' })
	expect(
		(
			await admin.query(
				'SELECT copied_from_id FROM hcm.work_schedule_version WHERE tenant_id=$1 AND id=$2',
				[tenant, copy.versionId],
			)
		).rows[0].copied_from_id,
	).toBe(source.versionId)
})

it('denies missing, scoped-only, revoked and invented authority', /** A global configuration operation needs one current tenant-wide grant independently of session claims and navigation. */ async () => {
	await expect(commands.create(toby, 'Templates', randomUUID(), draft())).rejects.toMatchObject({
		code: 'forbidden',
	})
	await expect(
		commands.create({ session: david.session }, 'Templates', randomUUID(), draft()),
	).rejects.toMatchObject({ code: 'unauthenticated' })
	await admin.query(
		"INSERT INTO hcm.access_role(tenant_id,id,label) VALUES($1,'scoped-time','Scoped time')",
		[tenant],
	)
	await admin.query(
		"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'scoped-time','hcm.attendance.work-schedule-templates.draft')",
		[tenant],
	)
	await admin.query(
		"INSERT INTO hcm.account_role(tenant_id,account_id,role_id,grant_id) VALUES($1,'dunder-mifflin/account/toby','scoped-time','scoped-time-grant')",
		[tenant],
	)
	await admin.query(
		"INSERT INTO hcm.account_role_scope(tenant_id,id,grant_id,scope_kind,employment_id) VALUES($1,'scoped-time-scope','scoped-time-grant','Employment','dunder-mifflin/employment/jim')",
		[tenant],
	)
	await expect(commands.create(toby, 'Templates', randomUUID(), draft())).rejects.toMatchObject({
		code: 'forbidden',
	})
	const input = draft(),
		key = randomUUID()
	await commands.create(david, 'Templates', key, input)
	await admin.query(
		"DELETE FROM hcm.role_permission WHERE tenant_id=$1 AND role_id='tenant-administrator' AND permission_code='hcm.attendance.work-schedule-templates.read'",
		[tenant],
	)
	try {
		await expect(commands.create(david, 'Templates', key, input)).rejects.toMatchObject({
			code: 'forbidden',
		})
	} finally {
		await admin.query(
			"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'tenant-administrator','hcm.attendance.work-schedule-templates.read')",
			[tenant],
		)
	}
	await admin.query(
		"UPDATE hcm.tenant_entitlement SET enabled=false WHERE tenant_id=$1 AND code='hcm.attendance'",
		[tenant],
	)
	try {
		await expect(commands.create(david, 'Templates', randomUUID(), draft())).rejects.toMatchObject({
			code: 'forbidden',
		})
	} finally {
		await admin.query(
			"UPDATE hcm.tenant_entitlement SET enabled=true WHERE tenant_id=$1 AND code='hcm.attendance'",
			[tenant],
		)
	}
})

it('rolls back new roots, children and audit if private reason encryption fails', /** Receipt storage is part of the business commit, not a best-effort log after success. */ async () => {
	const source = await publishedTemplate(),
		key = randomUUID()
	const unavailable = new AttendanceScheduleDrafts(
		new KyselyAttendanceScheduleUnit(access, new UnavailableFieldCipher()),
	)
	await expect(
		unavailable.copyTemplate(david, source.id, key, {
			sourceVersionId: source.versionId,
			expectedRevision: source.revision,
			code: 'ROLLBACK_COPY',
			name: 'Must roll back',
			reason: 'Private rationale',
		}),
	).rejects.toThrow('Field encryption is not configured')
	expect(
		(
			await admin.query(
				"SELECT id FROM hcm.work_schedule WHERE tenant_id=$1 AND code='ROLLBACK_COPY'",
				[tenant],
			)
		).rows,
	).toEqual([])
	expect(
		(
			await admin.query('SELECT id FROM hcm.audit_event WHERE tenant_id=$1 AND request_id=$2', [
				tenant,
				key,
			])
		).rows,
	).toEqual([])
	expect(
		(
			await admin.query(
				'SELECT id FROM hcm.attendance_command_receipt WHERE tenant_id=$1 AND idempotency_key=$2::uuid',
				[tenant, key],
			)
		).rows,
	).toEqual([])
})

it('rechecks session expiry after effects and before the transaction returns', /** A session that expires during encryption cannot leave committed configuration or audit behind. */ async () => {
	const source = await publishedTemplate(),
		key = randomUUID()
	const expiresAt = david.session.session.expiresAt
	if (!expiresAt) throw new Error('Expiring authenticated session required')
	const clock = vi.spyOn(Date, 'now')
	const expiringCipher: FieldCipher = {
		/** Bind the real tenant cipher and advance only the test clock after sealing completes. */
		bind(transaction, tenantId) {
			const bound = localCipher.bind(transaction, tenantId)
			return {
				decrypt: bound.decrypt,
				/** Simulate authentication expiry between the final awaited effect and commit validation. */
				async encrypt(target, plaintext) {
					const sealed = await bound.encrypt(target, plaintext)
					clock.mockReturnValue(Date.parse(expiresAt) + 1)
					return sealed
				},
			}
		},
	}
	try {
		const expiring = new AttendanceScheduleDrafts(
			new KyselyAttendanceScheduleUnit(access, expiringCipher),
		)
		await expect(
			expiring.copyTemplate(david, source.id, key, {
				sourceVersionId: source.versionId,
				expectedRevision: source.revision,
				code: 'EXPIRED_COPY',
				name: 'Expired command',
				reason: 'Private expiry test',
			}),
		).rejects.toMatchObject({ code: 'unauthenticated' })
	} finally {
		clock.mockRestore()
	}
	expect(
		(
			await admin.query(
				"SELECT id FROM hcm.work_schedule WHERE tenant_id=$1 AND code='EXPIRED_COPY'",
				[tenant],
			)
		).rows,
	).toEqual([])
	expect(
		(
			await admin.query('SELECT id FROM hcm.audit_event WHERE tenant_id=$1 AND request_id=$2', [
				tenant,
				key,
			])
		).rows,
	).toEqual([])
})
