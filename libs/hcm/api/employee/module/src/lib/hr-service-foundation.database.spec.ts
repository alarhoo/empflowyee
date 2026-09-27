import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { HcmEmployeeModule } from './hcm-api-employee-module'
import { startHcmTestApi, type HcmTestApi } from './employee-test-harness'

let api: HcmTestApi
const T = "'local-dunder-mifflin'"
const TOBY = "'dunder-mifflin/account/toby'"
const JIM = "'dunder-mifflin/account/jim'"

beforeAll(
	/** Start the real module over the migrated and seeded disposable database. */ async () => {
		api = await startHcmTestApi(HcmEmployeeModule)
	},
)
afterAll(
	/** Release the application and connections. */ async () => {
		await api?.close()
	},
)

/** Run statements as the migrator, rolling back and returning the error code of the last. */
async function attempt(...statements: string[]): Promise<string | undefined> {
	await api.admin.query('BEGIN')
	try {
		for (const statement of statements) await api.admin.query(statement)
		return undefined
	} catch (error) {
		return (error as { code?: string }).code
	} finally {
		await api.admin.query('ROLLBACK')
	}
}

/** A New request for Jim, as statements. */
function request(id: string, extra = ''): string {
	return `INSERT INTO hcm.hr_service_request (tenant_id,id,request_number,requester_worker_id,requester_account_id,created_by_account_id,
		type_id,service_level_policy_id,priority,subject,team_id${extra ? ',' + extra.split('=')[0] : ''})
		VALUES (${T},'${id}','HR-9${id.slice(-5).replace(/\D/g, '0').padStart(5, '0')}','dunder-mifflin/worker/jim',${JIM},${JIM},
		'dunder-mifflin/hr-request-type/general-question','dunder-mifflin/hr-service-level/standard-1','P4','Parking','dunder-mifflin/hr-team/operations'
		${extra ? ',' + extra.split('=')[1] : ''})`
}

/** A message on a request. */
function message(
	requestId: string,
	id: string,
	visibility: string,
	fromRequester: boolean,
	sequence = 1,
): string {
	return `INSERT INTO hcm.hr_service_request_message (tenant_id,id,request_id,sequence_number,visibility,kind,author_account_id,from_requester,body)
		VALUES (${T},'${id}','${requestId}',${sequence},'${visibility}','Message',${fromRequester ? JIM : TOBY},${fromRequester},'Hello')`
}

/** A Ready blob of a purpose. */
function blob(id: string, purpose: string): string {
	return `INSERT INTO hcm.document_blob (tenant_id,id,storage_key,sha256,byte_length,media_type,safe_filename,state,created_by_account_id,purpose)
		VALUES (${T},'${id}','${randomUUID()}','${'a'.repeat(64)}',10,'application/pdf','note.pdf','Ready',${TOBY},'${purpose}')`
}

describe('HR service foundation', /** DEC-HCM2-004 persistence. */ () => {
	it('seeds one team led by Toby, standard@1 and the request types', /** employee.operations@3. */ async () => {
		const policy = await api.admin.query(
			'SELECT code,version_number AS version,status,targets,pause_while_waiting AS pause,reopen_window_days AS reopen FROM hcm.hr_service_level_policy',
		)
		expect(policy.rows).toEqual([
			{
				code: 'standard',
				version: 1,
				status: 'Published',
				pause: true,
				reopen: 7,
				targets: {
					P1: { firstResponse: 240, resolution: 1440 },
					P2: { firstResponse: 1440, resolution: 4320 },
					P3: { firstResponse: 2880, resolution: 7200 },
					P4: { firstResponse: 4320, resolution: 14400 },
				},
			},
		])
		const types = await api.admin.query(
			'SELECT code,audience FROM hcm.hr_service_request_type ORDER BY sort_order',
		)
		expect(
			types.rows.map(
				/** Code. */ (row: { code: string; audience: string }) => `${row.code}:${row.audience}`,
			),
		).toEqual([
			'personal-data-correction:Employee',
			'general-question:Employee',
			'pay-question:Employee',
			'employment-letter:Employee',
			'workplace-concern:HrOnly',
		])
		const lead = await api.admin.query(
			'SELECT member_role FROM hcm.hr_service_team_membership WHERE account_id=$1',
			['dunder-mifflin/account/toby'],
		)
		expect(lead.rows).toEqual([{ member_role: 'Lead' }])
	})

	it('keeps internal content away from requesters and attachments on their message visibility', /** REQ-HR-SERVICE-DESK-002. */ async () => {
		expect(await attempt(request('r1'), message('r1', 'm1', 'Internal', true))).toBe('23514')
		expect(
			await attempt(request('r1'), message('r1', 'm1', 'EmployeeVisible', true)),
		).toBeUndefined()
		/** Attach a blob to the message. */
		const attach = (blobId: string, visibility: string) =>
			`INSERT INTO hcm.hr_service_request_attachment (tenant_id,id,request_id,message_id,blob_id,visibility,created_by_account_id)
			VALUES (${T},'${randomUUID()}','r1','m1','${blobId}','${visibility}',${TOBY})`
		const service = randomUUID()
		const document = randomUUID()
		expect(
			await attempt(
				request('r1'),
				message('r1', 'm1', 'Internal', false),
				blob(service, 'service-attachment'),
				attach(service, 'Internal'),
			),
		).toBeUndefined()
		expect(
			await attempt(
				request('r1'),
				message('r1', 'm1', 'Internal', false),
				blob(service, 'service-attachment'),
				attach(service, 'EmployeeVisible'),
			),
		).toBe('23514')
		expect(
			await attempt(
				request('r1'),
				message('r1', 'm1', 'Internal', false),
				blob(document, 'document'),
				attach(document, 'Internal'),
			),
		).toBe('23514')
	})

	it('guards lifecycle facts, request numbers and published policies', /** REQ-HR-SERVICE-DESK-004, -006. */ async () => {
		expect(await attempt(request('r1', "status='Resolved'"))).toBe('23514')
		expect(await attempt(request('r1', "status='Cancelled'"))).toBe('23514')
		expect(
			await attempt(
				request('r1'),
				request('r2').replace(/'HR-9\d+'/, "'HR-900001'"),
				request('r3').replace(/'HR-9\d+'/, "'HR-900001'"),
			),
		).toBe('23505')
		expect(
			await attempt(
				"UPDATE hcm.hr_service_level_policy SET targets=jsonb_set(targets,'{P1,firstResponse}','60') WHERE code='standard'",
			),
		).toBe('23514')
		expect(
			await attempt(
				"UPDATE hcm.hr_service_level_policy SET status='Retired' WHERE code='standard'",
			),
		).toBeUndefined()
		expect(
			await attempt(
				`INSERT INTO hcm.hr_service_level_policy (tenant_id,id,code,version_number,name,status,targets,published_at,created_by_account_id,updated_by_account_id)
				SELECT tenant_id,'standard-2',code,2,name,'Published',targets,now(),created_by_account_id,updated_by_account_id FROM hcm.hr_service_level_policy WHERE code='standard'`,
			),
		).toBe('23505')
		expect(
			await attempt(
				`INSERT INTO hcm.hr_service_level_policy (tenant_id,id,code,version_number,name,targets,created_by_account_id,updated_by_account_id)
				VALUES (${T},'bad','bad-targets',1,'Bad','{"P1":{"firstResponse":1,"resolution":2}}',${TOBY},${TOBY})`,
			),
		).toBe('23514')
	})

	it('grants the runtime append-only conversations', /** Append-only grants. */ async () => {
		const { rows } = await api.admin.query(
			`SELECT table_name,privilege_type FROM information_schema.role_table_grants WHERE grantee='hcm_runtime'
				AND table_name IN ('hr_service_request_message','hr_service_request_attachment') ORDER BY table_name,privilege_type`,
		)
		expect(
			rows.map(
				/** Grant. */ (row: { table_name: string; privilege_type: string }) =>
					`${row.table_name}:${row.privilege_type}`,
			),
		).toEqual([
			'hr_service_request_attachment:INSERT',
			'hr_service_request_attachment:SELECT',
			'hr_service_request_message:INSERT',
			'hr_service_request_message:SELECT',
		])
	})
})
