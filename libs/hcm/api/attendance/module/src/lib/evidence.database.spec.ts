import { evidenceHttp, uploadEvidence } from './evidence-http-test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { Pool } from 'pg'
import {
	LocalDocumentFiles,
	provisionDocumentRoot,
	KyselyDocumentEvidenceBinder,
} from '@empflowyee/hcm-api-documents-infrastructure'
import type { DocumentEvidenceStore } from '@empflowyee/hcm-api-documents-application'
import type { EvidenceSubject } from '@empflowyee/hcm-documents-contract'
import { HcmAttendanceModule } from './hcm-api-attendance-module'
import {
	startHcmTestApi,
	HCM_TEST_TENANT,
	HCM_TEST_ORIGIN,
	type HcmTestApi,
} from './attendance-test-harness'

let api: HcmTestApi, runtime: Kysely<unknown>, binder: KyselyDocumentEvidenceBinder
let home = ''
const actor = 'dunder-mifflin/account/david'
const subject: EvidenceSubject = {
	purpose: 'AttendanceEvidence',
	subject: JSON.stringify(['Override', 'dunder-mifflin/employment/jim', '2026-02-17']),
	classification: 'Restricted',
}
const metadata = {
	employmentId: 'dunder-mifflin/employment/jim',
	workDate: '2026-02-17',
	purpose: 'AttendanceEvidence',
	classification: 'Restricted',
}
const pdf = Buffer.from('%PDF-1.7\nlocal evidence fixture\n%%EOF')

/** Yield private test bytes through the same streaming interface as a multipart upload. */
async function* bytes(value = pdf) {
	yield value
}

/** Bind real runtime SQL and RLS; tests never receive an owner connection for source operations. */
function store<T>(
	work: (value: DocumentEvidenceStore) => Promise<T>,
	tenant = HCM_TEST_TENANT,
	accountId = actor,
) {
	return runtime.transaction().execute(
		/** Establish the exact tenant before the owner binder is constructed. */ async (tx) => {
			await sql`SELECT set_config('hcm.tenant_id',${tenant},true)`.execute(tx)
			return work(binder.bind(tx, { tenantId: tenant, accountId }))
		},
	)
}

/** Upload using the shared real HTTP multipart helper with this suite's dated metadata. */
function upload(
	value: unknown = metadata,
	content = pdf,
	options: Parameters<typeof uploadEvidence>[3] = {},
) {
	return uploadEvidence(api, value, content, options)
}
/** Read raw content without attempting to decode a file as a JSON DTO. */
async function download(id: string, persona = 'david') {
	return evidenceHttp(api, 'attendance/evidence/' + id + '/content', 'GET', Buffer.alloc(0), {
		'x-hcm-development-persona': persona,
	})
}

beforeAll(
	/** Start actual source HTTP and private storage over disposable migrated PostgreSQL. */ async () => {
		home = await mkdtemp(join(tmpdir(), 'hcm-attendance-evidence-'))
		await provisionDocumentRoot(join(home, 'private'))
		const files = new LocalDocumentFiles(join(home, 'private'))
		api = await startHcmTestApi(HcmAttendanceModule, HCM_TEST_ORIGIN, files)
		runtime = new Kysely({
			dialect: new PostgresDialect({
				pool: new Pool({ connectionString: process.env['HCM_TEST_RUNTIME'], max: 2 }),
			}),
		})
		binder = new KyselyDocumentEvidenceBinder(files)
	},
)
afterAll(
	/** Close pools before removing only the verified task-owned temporary private root. */ async () => {
		await runtime?.destroy()
		await api?.close()
		if (
			home &&
			resolve(home).startsWith(resolve(tmpdir()) + sep) &&
			home.includes('hcm-attendance-evidence-')
		)
			await rm(home, { recursive: true, force: true })
	},
)

describe('Attendance governed evidence', /** Verify real bytes, independent field authority and immutable binding. */ () => {
	it('stages private validated evidence and audits authorized content without exposing storage metadata', /** Source routes consume actual Documents storage. */ async () => {
		const result = await upload()
		expect(result.status, JSON.stringify(result.body)).toBe(201)
		expect(result.body).toEqual({
			id: expect.any(String),
			validation: 'Clean',
			classification: 'Restricted',
		})
		const content = await download(result.body.id)
		expect(content.status).toBe(200)
		expect(content.headers['content-disposition']).toContain('attachment;')
		expect(content.headers['x-content-type-options']).toBe('nosniff')
		expect(content.body).toEqual(pdf)
		const audit = await api.admin.query(
			'SELECT action,safe_summary FROM hcm.audit_event WHERE target_id=$1 ORDER BY occurred_at',
			[result.body.id],
		)
		expect(
			audit.rows.map(/** Compare only safe action identities. */ (row) => row.action),
		).toContain('document.download-authorized')
		expect(JSON.stringify(audit.rows)).not.toContain('evidence.pdf')
	})
	it('recovers one concurrent upload identity and rejects changed bytes or classification', /** Retry identity includes content, purpose, subject and class. */ async () => {
		const key = randomUUID()
		const results = await Promise.all([
			upload(metadata, pdf, { key }),
			upload(metadata, pdf, { key }),
		])
		expect(results.map(/** Both requests return the committed result. */ (r) => r.status)).toEqual([
			201, 201,
		])
		expect(results[0].body).toEqual(results[1].body)
		expect((await upload(metadata, Buffer.from('%PDF-1.7\nchanged'), { key })).status).toBe(409)
		expect((await upload({ ...metadata, classification: 'General' }, pdf, { key })).status).toBe(
			409,
		)
		const count = await api.admin.query(
			'SELECT count(*)::int AS n FROM hcm.document_business_evidence WHERE command_key=$1',
			[key],
		)
		expect(count.rows[0].n).toBe(1)
	})
	it('requires separate field and dated business authority and rejects invalid files', /** Read/manage permission alone cannot grant private content. */ async () => {
		const result = await upload()
		expect((await upload(metadata, pdf, { persona: 'jim' })).status).toBe(403)
		expect((await download(result.body.id, 'michael')).status).toBe(403)
		await api.admin.query(
			"DELETE FROM hcm.role_permission WHERE tenant_id=$1 AND role_id='tenant-administrator' AND permission_code='hcm.attendance.work-schedules.evidence.restricted'",
			[HCM_TEST_TENANT],
		)
		try {
			expect((await download(result.body.id)).status).toBe(403)
			expect((await upload()).status).toBe(403)
		} finally {
			await api.admin.query(
				"INSERT INTO hcm.role_permission(tenant_id,role_id,permission_code) VALUES($1,'tenant-administrator','hcm.attendance.work-schedules.evidence.restricted')",
				[HCM_TEST_TENANT],
			)
		}
		expect((await upload(metadata, Buffer.from('not a PDF'))).status).toBe(415)
		expect((await upload({ ...metadata, purpose: 'LeaveEvidence' })).status).toBe(400)
		expect((await upload({ ...metadata, employmentId: 'missing' })).status).toBeGreaterThanOrEqual(
			400,
		)
		expect(
			(await upload(metadata, Buffer.concat([pdf, Buffer.alloc(10 * 1024 * 1024)]))).status,
		).toBe(413)
	})
	it('attaches once and refuses another uploader, another subject, a downgrade or another source', /** Owner admission is exact and immutable. */ async () => {
		const staged = await store(
			/** Stage actual clean evidence under its original uploader. */ (s) =>
				s.stage(subject, randomUUID(), bytes(), 'source.pdf', 'application/pdf'),
		)
		await expect(
			store(
				/** Another uploader cannot consume this reference. */ (s) =>
					s.attach(subject, staged.id, 'override-a'),
				HCM_TEST_TENANT,
				'dunder-mifflin/account/toby',
			),
		).rejects.toMatchObject({ code: 'forbidden' })
		await expect(
			store(
				/** Subject rebinding is not admitted. */ (s) =>
					s.attach({ ...subject, subject: 'another' }, staged.id, 'override-a'),
			),
		).rejects.toMatchObject({ code: 'not-found' })
		await expect(
			store(
				/** Classification downgrade is not admitted. */ (s) =>
					s.attach({ ...subject, classification: 'General' }, staged.id, 'override-a'),
			),
		).rejects.toMatchObject({ code: 'not-found' })
		await store(/** First attachment commits. */ (s) => s.attach(subject, staged.id, 'override-a'))
		await store(
			/** Exact attachment replay is harmless. */ (s) => s.attach(subject, staged.id, 'override-a'),
		)
		await expect(
			store(
				/** A second source cannot reuse the reference. */ (s) =>
					s.attach(subject, staged.id, 'override-b'),
			),
		).rejects.toMatchObject({ code: 'invalid-state' })
		await expect(
			api.admin.query(
				"UPDATE hcm.document_business_evidence SET classification='General' WHERE tenant_id=$1 AND id=$2",
				[HCM_TEST_TENANT, staged.id],
			),
		).rejects.toMatchObject({ code: '23514' })
	})
	it('rejects foreign tenant reads and forged transaction tenant bindings', /** RLS and the binder both enforce the caller tenant. */ async () => {
		const staged = await store(
			/** Commit a reference in the owning tenant. */ (s) =>
				s.stage(subject, randomUUID(), bytes(), 'tenant.pdf', 'application/pdf'),
		)
		await expect(
			store(
				/** Foreign tenant cannot inspect metadata. */ (s) => s.inspect(staged.id),
				'local-other',
			),
		).rejects.toMatchObject({ code: 'not-found' })
		await expect(
			runtime.transaction().execute(
				/** Deliberately mismatch the private binder and SQL context. */ async (tx) => {
					await sql`SELECT set_config('hcm.tenant_id',${HCM_TEST_TENANT},true)`.execute(tx)
					return binder.bind(tx, { tenantId: 'local-other', accountId: actor }).inspect(staged.id)
				},
			),
		).rejects.toMatchObject({ code: 'forbidden' })
	})
	it.each(['Pending', 'Blocked'])(
		'refuses %s validation evidence for opening or attachment',
		/** SQL and owner checks both reject unclean records. */ async (validation) => {
			const id = randomUUID(),
				blob = randomUUID()
			await api.admin.query(
				"INSERT INTO hcm.document_blob(tenant_id,id,storage_key,sha256,byte_length,media_type,safe_filename,state,created_by_account_id,purpose) VALUES($1,$2,$2,repeat('a',64),10,'application/pdf','pending.pdf','Staged',$3,'AttendanceEvidence')",
				[HCM_TEST_TENANT, blob, actor],
			)
			await api.admin.query(
				"INSERT INTO hcm.document_business_evidence(tenant_id,id,blob_id,purpose,subject,classification,uploader_account_id,command_key,payload_hash,validation) VALUES($1,$2,$3,$4,$5,$6,$7,$8,repeat('b',64),$9)",
				[
					HCM_TEST_TENANT,
					id,
					blob,
					subject.purpose,
					subject.subject,
					subject.classification,
					actor,
					randomUUID(),
					validation,
				],
			)
			await expect(
				store(/** No private bytes may open before Clean. */ (s) => s.open(subject, id)),
			).rejects.toMatchObject({ code: 'record-incomplete' })
			await expect(
				store(
					/** No source may consume pending or blocked evidence. */ (s) =>
						s.attach(subject, id, 'override'),
				),
			).rejects.toMatchObject({ code: 'record-incomplete' })
			await expect(
				api.admin.query(
					'INSERT INTO hcm.document_evidence_attachment(tenant_id,evidence_id,source_id) VALUES($1,$2,$3)',
					[HCM_TEST_TENANT, id, 'override'],
				),
			).rejects.toMatchObject({ code: '23514' })
		},
	)
})
