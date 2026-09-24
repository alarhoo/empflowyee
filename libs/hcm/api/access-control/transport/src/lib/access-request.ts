import { HttpException, type Logger } from '@nestjs/common'
import { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import {
	HcmRuntimeError,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import { HcmAccessError } from '@empflowyee/hcm-api-access-control-application'
import { AssignmentError, RoleError, ReviewError } from '@empflowyee/hcm-access-control-contract'
export const HCM_ROLE_WRITE_ORIGIN = Symbol('HCM_ROLE_WRITE_ORIGIN')
export interface RoleRequest {
	originalUrl: string
	headers: Record<string, string | string[] | undefined>
}
export interface RoleResponse {
	setHeader(name: string, value: string): void
}

/** Reject unknown and duplicate parameters before converting bounded list query values. */
export function queryParameters(request: RoleRequest, allowed: string[]): URLSearchParams {
	const query = new URL(request.originalUrl, 'http://local.invalid').searchParams
	for (const key of query.keys())
		if (!allowed.includes(key) || query.getAll(key).length !== 1)
			throw new RoleError('invalid-request')
	return query
}
/** Reject cross-origin, missing-origin, unapproved media and duplicate/unknown mutation query input. */
export function accessWriteKey(
	request: RoleRequest,
	origin: string | null,
	requestId: string,
	media: 'json' | 'multipart' = 'json',
): string {
	queryParameters(request, [])
	if (
		!origin ||
		request.headers['origin'] !== origin ||
		(request.headers['sec-fetch-site'] !== undefined &&
			request.headers['sec-fetch-site'] !== 'same-origin')
	)
		throw new HcmAccessError('forbidden')
	if (
		typeof request.headers['content-type'] !== 'string' ||
		!(
			media === 'json'
				? /^application\/json(?:\s*;\s*charset=utf-8)?$/i
				: /^multipart\/form-data\s*;\s*boundary=/i
		).test(request.headers['content-type'])
	)
		throw new HttpException({ code: 'unsupported-media-type', requestId: requestId }, 415)
	const key = request.headers['idempotency-key']
	if (typeof key !== 'string') throw new RoleError('invalid-request')
	return key
}
/** Resolve server authority, prevent caching and sanitize failures without leaking SQL or payloads. */
export async function runAccessRequest<T>(
	context: HcmRequestTenantContext,
	logger: Logger,
	response: RoleResponse,
	work: (context: AuthenticatedHcmContext) => Promise<T>,
): Promise<T> {
	response.setHeader('Cache-Control', 'no-store')
	response.setHeader('X-Request-ID', context.requestId)
	try {
		return await work(await context.authenticated())
	} catch (error) {
		if (error instanceof HttpException) throw error
		const code =
			error instanceof ReviewError ||
			error instanceof AssignmentError ||
			error instanceof RoleError ||
			error instanceof HcmAccessError ||
			error instanceof HcmRuntimeError
				? error.code
				: 'runtime-unavailable'
		const statuses: Record<string, number> = {
			'invalid-request': 400,
			unauthenticated: 401,
			forbidden: 403,
			'not-found': 404,
			'tenant-not-found': 404,
			'tenant-suspended': 423,
			'runtime-unavailable': 503,
		}
		const status = statuses[code] ?? 409
		if (status === 503) logger.error({ code, requestId: context.requestId })
		throw new HttpException({ code, requestId: context.requestId }, status)
	}
}
