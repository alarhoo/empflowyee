import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	RoleSummary,
	RoleDetail,
	Page,
	PermissionOption,
	CreateRole,
	UpdateRole,
	DeleteRole,
	RoleCommandResult,
} from '@empflowyee/hcm-access-control-contract'

@Injectable({ providedIn: 'root' })
export class RoleApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/access-control'
	/** Load a server-owned role page; caller state never filters a cached tenant inventory. */
	list(query: { q: string; systemRole: string; sort: string; cursor?: string }) {
		let params = new HttpParams().set('q', query.q).set('sort', query.sort)
		if (query.systemRole) params = params.set('systemRole', query.systemRole)
		if (query.cursor) params = params.set('cursor', query.cursor)
		return this.http.get<Page<RoleSummary>>(`${this.base}/roles`, { params }).pipe(timeout(15000))
	}
	/** Read fresh detail before displaying a role revision. */
	get(id: string) {
		return this.http
			.get<RoleDetail>(`${this.base}/roles/${encodeURIComponent(id)}`)
			.pipe(timeout(15000))
	}
	/** Obtain persisted descriptions and registered codes from the API. */
	permissions() {
		return this.http
			.get<{ items: PermissionOption[] }>(`${this.base}/permissions`)
			.pipe(timeout(15000))
	}
	/** Persist a reviewed command with a caller-retained retry key; persona headers belong to runtime infrastructure. */
	command(
		mode: 'create' | 'update' | 'delete',
		id: string | undefined,
		body: CreateRole | UpdateRole | DeleteRole,
		key: string,
	) {
		const headers = { 'Idempotency-Key': key }
		const path =
			mode === 'create'
				? `${this.base}/roles`
				: `${this.base}/roles/${encodeURIComponent(id ?? '')}`
		if (mode === 'update')
			return this.http.put<RoleCommandResult>(path, body, { headers }).pipe(timeout(15000))
		return this.http
			.post<RoleCommandResult>(mode === 'delete' ? `${path}/delete` : path, body, { headers })
			.pipe(timeout(15000))
	}
}
/** Translate only stable server classifications; never display arbitrary provider error bodies. */
export function roleErrorMessage(error: unknown): string {
	const code = error instanceof HttpErrorResponse ? error.error?.code : undefined
	const messages: Record<string, string> = {
		'invalid-request': 'Check the role fields and select only registered permissions.',
		'revision-conflict':
			'This role changed. Your draft is preserved; cancel and reopen the role to load its current revision.',
		'duplicate-label': 'A role with this name already exists.',
		'system-role': 'System roles cannot be changed.',
		'role-assigned': 'This role is assigned to an account and cannot be deleted.',
		forbidden: 'You no longer have permission for this operation.',
		unauthenticated: 'Your session is no longer available.',
		'not-found': 'This role is no longer available.',
		'idempotency-conflict':
			'The retry key belongs to a different command. Reload the role before continuing.',
	}
	return typeof code === 'string' && messages[code]
		? messages[code]
		: 'The operation could not be completed. Retry safely with the same draft.'
}
