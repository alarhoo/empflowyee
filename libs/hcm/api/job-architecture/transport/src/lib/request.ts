import type { RoleRequest } from '@empflowyee/hcm-api-access-control-transport'

/** Parse the query string of the verified request URL. */
export function query(request: RoleRequest): URLSearchParams {
	return new URL(request.originalUrl, 'http://local.invalid').searchParams
}
