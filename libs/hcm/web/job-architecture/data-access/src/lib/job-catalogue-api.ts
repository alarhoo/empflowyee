import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http'
import { timeout } from 'rxjs'
import type {
	ArchitectureStatus,
	CatalogueElementKind,
	CatalogueSummaryDto,
	CatalogueVersionDto,
	JobFamilyPage,
	JobProfilePage,
	JobProfileVersionDraft,
	JobProfileVersionDto,
} from '@empflowyee/hcm-job-architecture-contract'

export interface ProfileListQuery {
	q?: string
	familyId?: string
	status?: ArchitectureStatus
	cursor?: string
}

const limit = 15000

/** Job Catalogue API; the server remains the authority for every rule. */
@Injectable({ providedIn: 'root' })
export class JobCatalogueApi {
	private readonly http = inject(HttpClient)
	private readonly base = '/api/v1/job-architecture'

	/** Attach the caller-retained idempotency key to one command. */
	private headers(key: string) {
		return { headers: { 'Idempotency-Key': key } }
	}

	/** An encoded version path. */
	private version(id: string): string {
		return `${this.base}/catalogue-versions/${encodeURIComponent(id)}`
	}

	/** An encoded profile version path. */
	private profileVersion(id: string): string {
		return `${this.base}/profile-versions/${encodeURIComponent(id)}`
	}

	/** The tenant's catalogue with its versions. */
	catalogues() {
		return this.http
			.get<{ items: CatalogueSummaryDto[] }>(`${this.base}/catalogues`)
			.pipe(timeout(limit))
	}

	/** One catalogue version. */
	readVersion(id: string) {
		return this.http.get<CatalogueVersionDto>(this.version(id)).pipe(timeout(limit))
	}

	/** Families of a version under one parent; roots when no parent is given. */
	families(id: string, parentId: string | null, cursor?: string) {
		let params = new HttpParams().set('limit', '100')
		if (parentId) params = params.set('parentId', parentId)
		if (cursor) params = params.set('cursor', cursor)
		return this.http
			.get<JobFamilyPage>(`${this.version(id)}/families`, { params })
			.pipe(timeout(limit))
	}

	/** Create a draft successor of the current published version. */
	createVersion(
		catalogueId: string,
		body: { basedOnVersionId: string; changeSummary: string; reason: string },
		key: string,
	) {
		return this.http
			.post<CatalogueVersionDto>(
				`${this.base}/catalogues/${encodeURIComponent(catalogueId)}/versions`,
				body,
				this.headers(key),
			)
			.pipe(timeout(limit))
	}

	/** Add an element to a draft version. */
	addElement(id: string, kind: CatalogueElementKind, body: Record<string, unknown>, key: string) {
		return this.http
			.post<CatalogueVersionDto>(`${this.version(id)}/${kind}`, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Edit, retire or reactivate an element of a draft version. */
	updateElement(
		id: string,
		kind: CatalogueElementKind,
		elementId: string,
		body: Record<string, unknown>,
		key: string,
	) {
		return this.http
			.put<CatalogueVersionDto>(
				`${this.version(id)}/${kind}/${encodeURIComponent(elementId)}`,
				body,
				this.headers(key),
			)
			.pipe(timeout(limit))
	}

	/** Submit a draft version for review. */
	submitVersion(id: string, body: { expectedRevision: number; reason: string }, key: string) {
		return this.http
			.post<CatalogueVersionDto>(`${this.version(id)}/submit`, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Publish a reviewed version. */
	publishVersion(
		id: string,
		body: { effectiveFrom: string; expectedRevision: number; reason: string },
		key: string,
	) {
		return this.http
			.post<CatalogueVersionDto>(`${this.version(id)}/publish`, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** One page of job profiles. */
	profiles(query: ProfileListQuery) {
		let params = new HttpParams().set('limit', '25')
		for (const [name, value] of Object.entries(query))
			if (value) params = params.set(name, value as string)
		return this.http.get<JobProfilePage>(`${this.base}/profiles`, { params }).pipe(timeout(limit))
	}

	/** One profile version. */
	readProfileVersion(id: string) {
		return this.http.get<JobProfileVersionDto>(this.profileVersion(id)).pipe(timeout(limit))
	}

	/** Create a job profile with its first draft version. */
	createProfile(
		body: { code: string; name: string; draft: JobProfileVersionDraft; reason: string },
		key: string,
	) {
		return this.http
			.post<JobProfileVersionDto>(`${this.base}/profiles`, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Create a draft successor of the current published profile version. */
	createProfileVersion(
		profileId: string,
		body: { basedOnVersionId: string; reason: string },
		key: string,
	) {
		return this.http
			.post<JobProfileVersionDto>(
				`${this.base}/profiles/${encodeURIComponent(profileId)}/versions`,
				body,
				this.headers(key),
			)
			.pipe(timeout(limit))
	}

	/** Replace a draft profile version's content. */
	updateProfileVersion(
		id: string,
		body: { draft: JobProfileVersionDraft; expectedRevision: number; reason: string },
		key: string,
	) {
		return this.http
			.put<JobProfileVersionDto>(this.profileVersion(id), body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Submit a draft profile version for review. */
	submitProfileVersion(
		id: string,
		body: { expectedRevision: number; reason: string },
		key: string,
	) {
		return this.http
			.post<JobProfileVersionDto>(`${this.profileVersion(id)}/submit`, body, this.headers(key))
			.pipe(timeout(limit))
	}

	/** Publish a reviewed profile version. */
	publishProfileVersion(
		id: string,
		body: { effectiveFrom: string; expectedRevision: number; reason: string },
		key: string,
	) {
		return this.http
			.post<JobProfileVersionDto>(`${this.profileVersion(id)}/publish`, body, this.headers(key))
			.pipe(timeout(limit))
	}
}

/** Report whether a failure is an authorization denial rather than a transient fault. */
export function jobArchitectureDenied(error: unknown): boolean {
	return error instanceof HttpErrorResponse && [401, 403].includes(error.status)
}

/** Report whether the object is missing or outside the caller's tenant. */
export function jobArchitectureMissing(error: unknown): boolean {
	return error instanceof HttpErrorResponse && error.status === 404
}

const fieldLabels: Record<string, string> = {
	code: 'Code',
	name: 'Name',
	parentId: 'Parent family',
	kind: 'Track kind',
	trackId: 'Career track',
	bandId: 'Band',
	sequence: 'Sequence',
	sortOrder: 'Display order',
	effectiveFrom: 'Effective from',
	basedOnVersionId: 'Base version',
	catalogueVersionId: 'Catalogue version',
	familyId: 'Job family',
	levelId: 'Level',
	allowedGrades: 'Allowed grades',
	responsibilities: 'Responsibilities',
	requirements: 'Requirements',
	reason: 'Reason for change',
}

/** Field-specific explanations of a rejected value. */
const fieldCodeMessages: Record<string, (label: string) => string> = {
	duplicate: /** Uniqueness. */ (label) => `${label} is already used in this version.`,
	'too-deep': /** Depth. */ () => 'Job families are at most two levels deep.',
	'not-after-current': /** Dates. */ () =>
		'The effective date must be after the current version started.',
	'not-current': /** Currency. */ (label) =>
		`${label} must be the current published catalogue version.`,
	'one-default': /** Default grade. */ () => 'Choose exactly one default grade.',
	unknown: /** References. */ (label) => `${label} is not part of this catalogue version.`,
}

/** Translate stable server classifications; never display arbitrary provider error bodies. */
export function jobArchitectureErrorMessage(error: unknown): string {
	const body = error instanceof HttpErrorResponse ? error.error : undefined
	const code = body?.code
	const first = Array.isArray(body?.fieldErrors) ? body.fieldErrors[0] : undefined
	const field = typeof first?.field === 'string' ? (first.field as string) : ''
	const label = fieldLabels[field.split('.')[0] ?? ''] ?? field
	const specific = typeof first?.code === 'string' ? fieldCodeMessages[first.code] : undefined
	if (specific && label) return specific(label)
	const messages: Record<string, string> = {
		'invalid-request': label ? `Check ${label}.` : 'Check the highlighted fields.',
		'duplicate-code': 'This code already exists. Choose another code.',
		'revision-conflict': 'This version changed. Your draft is preserved; reload before continuing.',
		'version-published': 'Only draft versions can change. Create a draft to make corrections.',
		'invalid-state': 'This version no longer allows that step. Reload its current state.',
		'record-incomplete': 'Add families, tracks and bands before submitting.',
		'overlapping-effective-period': 'Another version is already effective on that date.',
		'idempotency-conflict': 'This retry belongs to another change. Reload before continuing.',
		forbidden: 'You no longer have permission for this operation.',
		unauthenticated: 'Your session is no longer available.',
		'not-found': 'This item is no longer available.',
	}
	return typeof code === 'string' && messages[code]
		? messages[code]
		: 'The operation could not be completed. Retry safely with the same draft.'
}
