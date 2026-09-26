import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	DepartmentInput,
	DesignationInput,
	LegalEntityInput,
	LocationInput,
	OrganisationProfileView,
	StructureArea,
	StructureItemDto,
	StructureOption,
	StructureOptionKind,
	StructurePage,
	UnitDetailDto,
	UnitTypeInput,
	UnitVersionInput,
} from '@empflowyee/hcm-workforce-foundation-contract'

export interface StructurePageQuery {
	q: string
	sort: string
	limit: number
	cursor?: string
	active?: boolean
	parentId?: string
	asOf?: string
}
export interface ProfileBody {
	defaultTimeZone: string
	defaultLanguage: string
	defaultCurrencyCode: string
	financialYearStartMonth: number
	financialYearStartDay: number
	headquartersLocationId: string | null
	expectedRevision: number
	reason: string
}
export type UnitTypeCreateBody = UnitTypeInput & {
	parentTypeId: string | null
	legalEntityBearing: boolean
}
export type StructureValue =
	| LegalEntityInput
	| UnitTypeInput
	| UnitTypeCreateBody
	| UnitVersionInput
	| DepartmentInput
	| DesignationInput
	| LocationInput
export type StructureCreateBody = StructureValue & { code: string; reason: string }
export type StructureUpdateBody = StructureValue & { expectedRevision: number; reason: string }
export type StructureDetail = StructureItemDto | UnitDetailDto
export interface ActiveBody {
	active: boolean
	expectedRevision: number
	reason: string
}
export type UnitVersionBody = UnitVersionInput & { expectedRevision: number; reason: string }
export interface UnitRetireBody {
	effectiveTo: string
	successorId: string | null
	expectedRevision: number
	reason: string
}

const limit = 15000

/** Workforce-owned organisation structure API; the server remains the authority for every rule. */
@Injectable({ providedIn: 'root' })
export class OrganisationStructureApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/workforce-foundation/structure'

	/** Build the per-item path without trusting identifiers as URL syntax. */
	private path(area: StructureArea, id?: string): string {
		return `${this.base}/${area}${id === undefined ? '' : '/' + encodeURIComponent(id)}`
	}

	/** Attach the caller-retained idempotency key to one command. */
	private headers(key: string) {
		return { headers: { 'Idempotency-Key': key } }
	}

	/** Read organisation HR defaults and the Account-owned display name. */
	profile() {
		return this.http
			.get<OrganisationProfileView>(`${this.base}/organisation-profile`)
			.pipe(timeout(limit))
	}

	/** Create or update organisation HR defaults at the loaded revision. */
	saveProfile(body: ProfileBody, key: string) {
		return this.http
			.put<OrganisationProfileView>(`${this.base}/organisation-profile`, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Read one server-owned page of an area; units are read at an as-of date. */
	list(area: StructureArea, query: StructurePageQuery) {
		let params = new HttpParams().set('sort', query.sort).set('limit', query.limit)
		if (query.q) params = params.set('q', query.q)
		if (query.cursor) params = params.set('cursor', query.cursor)
		if (query.active !== undefined) params = params.set('active', String(query.active))
		if (query.parentId) params = params.set('parentId', query.parentId)
		if (query.asOf) params = params.set('asOf', query.asOf)
		return this.http.get<StructurePage>(this.path(area), { params }).pipe(timeout(limit))
	}

	/** Read one fresh item; units include versions and usage at the as-of date. */
	detail(area: StructureArea, id: string, asOf?: string) {
		return this.http
			.get<StructureDetail>(this.path(area, id), { params: asOf ? { asOf } : {} })
			.pipe(timeout(limit))
	}

	/** Read one bounded picker page; pickers require the manage permission on the server. */
	options(kind: StructureOptionKind, q: string, includeInactive = false) {
		let params = new HttpParams().set('limit', 25)
		if (q) params = params.set('q', q)
		if (includeInactive) params = params.set('includeInactive', 'true')
		return this.http
			.get<{ items: StructureOption[]; nextCursor: string | null }>(
				`${this.base}/options/${kind}`,
				{
					params,
				},
			)
			.pipe(timeout(limit))
	}

	/** Create one item with its immutable code. */
	create(area: StructureArea, body: StructureCreateBody, key: string) {
		return this.http
			.post<StructureDetail>(this.path(area), body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Update the mutable fields of a non-unit item at its loaded revision. */
	update(area: StructureArea, id: string, body: StructureUpdateBody, key: string) {
		return this.http
			.put<StructureDetail>(this.path(area, id), body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Retire or reactivate a non-unit item. */
	setActive(area: StructureArea, id: string, body: ActiveBody, key: string) {
		return this.http
			.post<StructureDetail>(`${this.path(area, id)}/active`, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Add an effective-dated unit version that closes the current one. */
	addUnitVersion(id: string, body: UnitVersionBody, key: string) {
		return this.http
			.post<UnitDetailDto>(`${this.path('units', id)}/versions`, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Retire a unit from a date, optionally naming its successor. */
	retireUnit(id: string, body: UnitRetireBody, key: string) {
		return this.http
			.post<UnitDetailDto>(`${this.path('units', id)}/retire`, body, this.headers(key))
			.pipe(timeout(limit))
	}
}

/** Report whether a failure is an authorization denial rather than a transient fault. */
export function structureDenied(error: unknown): boolean {
	return error instanceof HttpErrorResponse && [401, 403].includes(error.status)
}

/** Report whether the object is missing or outside the caller's tenant. */
export function structureMissing(error: unknown): boolean {
	return error instanceof HttpErrorResponse && error.status === 404
}

const fieldMessages: Record<string, string> = {
	cycle: 'This placement would create a cycle.',
	'root-type': 'Units of this type are top-level and cannot have a parent.',
	'type-chain': 'The parent must be a unit of this type’s parent type.',
	'bearing-level': 'Set a legal entity only on legal-entity-bearing unit types.',
	'single-per-parent': 'This parent already has a unit of this type.',
	disabled: 'This selection is disabled for new use.',
	depth: 'The unit type chain is too deep.',
	'not-effective': 'The selection is not effective on the chosen date.',
	'after-current-version': 'The new version must start after the current version.',
	'before-version': 'The retirement date is before the current version starts.',
	self: 'A unit cannot succeed itself.',
}

/** Read the server's field errors as field identities with safe display text. */
export function structureFieldErrors(error: unknown): { field: string; message: string }[] {
	const errors = error instanceof HttpErrorResponse ? error.error?.fieldErrors : undefined
	if (!Array.isArray(errors)) return []
	return errors
		.filter(
			/** Keep only well-formed field identities. */ (
				item,
			): item is { field: string; code: string } =>
				typeof item?.field === 'string' && typeof item?.code === 'string',
		)
		.map(
			/** Translate stable codes; never echo submitted values. */ (item) => ({
				field: item.field,
				message: fieldMessages[item.code] ?? 'Check this value.',
			}),
		)
}

/** Translate stable server classifications; never display arbitrary provider error bodies. */
export function structureErrorMessage(error: unknown): string {
	const code = error instanceof HttpErrorResponse ? error.error?.code : undefined
	const field = structureFieldErrors(error)[0]
	const messages: Record<string, string> = {
		'invalid-request': field
			? `Check ${field.field}: ${field.message}`
			: 'Check the highlighted fields and filters.',
		'duplicate-code': 'This code already exists. Choose another code.',
		'structure-in-use':
			'This item is still used by current or future assignments, positions, child units or locations.',
		'revision-conflict':
			'This item changed. Your draft is preserved; reload the item before continuing.',
		'overlapping-effective-period': 'The new version must start after the current version.',
		'effective-date-out-of-range': 'The date is outside the item’s effective period.',
		'invalid-state': 'This item no longer allows that change. Reload its current state.',
		'idempotency-conflict': 'This retry belongs to another change. Reload before continuing.',
		forbidden: 'You no longer have permission for this operation.',
		unauthenticated: 'Your session is no longer available.',
		'not-found': 'This item is no longer available.',
	}
	return typeof code === 'string' && messages[code]
		? messages[code]
		: 'The operation could not be completed. Retry safely with the same draft.'
}
