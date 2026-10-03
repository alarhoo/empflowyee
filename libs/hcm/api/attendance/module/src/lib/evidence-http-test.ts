import { request, type IncomingHttpHeaders } from 'node:http'
import { randomUUID } from 'node:crypto'
import type { StagedEvidence } from '@empflowyee/hcm-documents-contract'
import { HCM_TEST_ORIGIN, type HcmTestApi } from './attendance-test-harness'
/** Send a real loopback request while preserving the actual tenant Host header. */
export function evidenceHttp(
	api: HcmTestApi,
	path: string,
	method: string,
	body: Buffer,
	headers: Record<string, string>,
) {
	return new Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>(
		/** Collect exact response bytes without coercing file content. */ (resolveReply, reject) => {
			const req = request(
				api.origin + '/api/v1/' + path,
				{
					method,
					headers: { host: 'acme.localhost', 'content-length': String(body.length), ...headers },
				},
				/** Accumulate the bounded test response. */ (response) => {
					const chunks: Buffer[] = []
					response.on(
						'data',
						/** Preserve binary response bytes. */ (chunk) => chunks.push(Buffer.from(chunk)),
					)
					response.on(
						'end',
						/** Return observed HTTP status, headers and bytes. */ () =>
							resolveReply({
								status: response.statusCode ?? 0,
								headers: response.headers,
								body: Buffer.concat(chunks),
							}),
					)
				},
			)
			req.on('error', reject)
			req.end(body)
		},
	)
}
/** Exercise actual metadata-first multipart parsing, current persona and origin checks. */
export async function uploadEvidence(
	api: HcmTestApi,
	value: unknown,
	content = Buffer.from('%PDF-1.7\nlocal evidence fixture\n%%EOF'),
	options: { persona?: string; key?: string; filename?: string; mediaType?: string } = {},
) {
	const form = new FormData()
	form.append('metadata', JSON.stringify(value))
	form.append(
		'file',
		new Blob([content], { type: options.mediaType ?? 'application/pdf' }),
		options.filename ?? 'evidence.pdf',
	)
	const encoded = new Request(api.origin, { method: 'POST', body: form })
	const response = await evidenceHttp(
		api,
		'attendance/evidence/staged',
		'POST',
		Buffer.from(await encoded.arrayBuffer()),
		{
			origin: HCM_TEST_ORIGIN,
			'sec-fetch-site': 'same-origin',
			'x-hcm-development-persona': options.persona ?? 'david',
			'idempotency-key': options.key ?? randomUUID(),
			'content-type': encoded.headers.get('content-type') ?? '',
		},
	)
	return {
		status: response.status,
		body: JSON.parse(response.body.toString()) as StagedEvidence & { code?: string },
	}
}
