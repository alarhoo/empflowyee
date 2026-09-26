import { createHash, randomUUID } from 'node:crypto'
import {
	parseCatalogueVersionCreate,
	parseElementCreate,
	parseElementUpdate,
	parseFamilyQuery,
	parseProfileCreate,
	parseProfileDraftUpdate,
	parseProfileQuery,
	parseProfileVersionCreate,
	parsePublish,
	parseSubmit,
	type ArchitectureStatus,
	type CatalogueSummaryDto,
	type CatalogueVersionDto,
	type ElementCreate,
	type ElementUpdate,
	type JobFamilyNodeDto,
	type JobFamilyPage,
	type JobProfilePage,
	type JobProfileVersionDraft,
	type JobProfileVersionDto,
} from '@empflowyee/hcm-job-architecture-contract'
import { HcmDomainError, idValue, invalidField } from '@empflowyee/hcm-runtime-contract'
import {
	commandHash,
	runIdempotent,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import {
	dayBefore,
	requireAllowedGrades,
	requireDraft,
	requireEffectiveAfter,
	requireFamilyParent,
	requireTransition,
	requireUniqueCodes,
} from '@empflowyee/hcm-api-job-architecture-domain'
import type { CatalogueReader } from './catalogue-repository'
import type { JobArchitectureUnitOfWork, JobArchitectureWork } from './job-architecture-unit'

/** A locked catalogue or profile version. */
export interface VersionLock {
	id: string
	/** The catalogue or profile the version belongs to. */
	ownerId: string
	status: ArchitectureStatus
	revision: number
	versionNumber: number
	effectiveFrom: string | null
	/** For a profile version, the catalogue version it references. */
	catalogueVersionId?: string
}

/** A locked catalogue or profile with its current pointer and latest version number. */
export interface OwnerLock {
	id: string
	currentVersionId: string | null
	latestVersionNumber: number
}

/** Publication of a version, closing the one it replaces. */
export interface Publication {
	id: string
	ownerId: string
	effectiveFrom: string
	digest: string
	/** The published version to close the day before, if any. */
	previous: { id: string; effectiveTo: string } | null
}

/** Job architecture persistence bound to one authorized transaction. */
export interface CatalogueRepository extends CatalogueReader {
	/** Lock the tenant's catalogue. */
	lockCatalogue(): Promise<OwnerLock | undefined>
	/** Lock one catalogue version. */
	lockVersion(id: string): Promise<VersionLock | undefined>
	/** Create a draft successor, copying every child of the version it is based on. */
	createSuccessor(input: {
		id: string
		catalogueId: string
		versionNumber: number
		basedOnId: string
		changeSummary: string
	}): Promise<void>
	/** Every family of a version, for validation and the publication digest. */
	allFamilies(versionId: string): Promise<JobFamilyNodeDto[]>
	/** Add one element to a draft version. */
	addElement(versionId: string, id: string, element: ElementCreate): Promise<void>
	/** Update one element of a draft version; false when it is not part of the version. */
	updateElement(versionId: string, id: string, update: ElementUpdate): Promise<boolean>
	/** Advance a version's revision after a change to it or its children. */
	touchVersion(id: string, fields?: { status?: 'InReview' }): Promise<void>
	/** Publish a catalogue version, close its predecessor and move the catalogue pointer. */
	publishVersion(publication: Publication): Promise<void>
	/** Lock one job profile. */
	lockProfile(id: string): Promise<OwnerLock | undefined>
	/** Create a job profile. */
	createProfile(id: string, code: string, name: string): Promise<void>
	/** Lock one job profile version. */
	lockProfileVersion(id: string): Promise<VersionLock | undefined>
	/** Insert a draft profile version with its children. */
	insertProfileVersion(input: {
		id: string
		profileId: string
		versionNumber: number
		supersedesId: string | null
		draft: JobProfileVersionDraft
	}): Promise<void>
	/** Replace a draft profile version's content and children and advance its revision. */
	replaceProfileDraft(id: string, draft: JobProfileVersionDraft): Promise<void>
	/** Advance a profile version's revision, optionally submitting it. */
	touchProfileVersion(id: string, fields?: { status?: 'InReview' }): Promise<void>
	/** Publish a profile version, close its predecessor and move the profile pointer. */
	publishProfileVersion(publication: Publication): Promise<void>
}

const READ = 'catalogue.read'
const MANAGE = 'catalogue.manage'
const PUBLISH = 'catalogue.publish'

/** A stable digest of published content (TDD#ACTION). */
function digest(content: unknown): string {
	return createHash('sha256').update(JSON.stringify(content)).digest('hex')
}

/** Refuse a stale expected revision. */
function requireRevision(current: number, expected: number): void {
	if (current !== expected) throw new HcmDomainError('revision-conflict')
}

/** Job Catalogue use cases: versioned catalogue maintenance and job profiles. */
export class JobCatalogue {
	/** Bind the use cases to the job architecture unit of work. */
	constructor(private readonly unit: JobArchitectureUnitOfWork) {}

	/** The tenant's catalogue, or none. */
	catalogues(context: AuthenticatedHcmContext): Promise<{ items: CatalogueSummaryDto[] }> {
		return this.unit.execute(
			context,
			READ,
			false,
			/** Read the one catalogue. */ async (w) => {
				const catalogue = await w.catalogue.catalogue()
				return { items: catalogue ? [catalogue] : [] }
			},
		)
	}

	/** One catalogue version. */
	version(context: AuthenticatedHcmContext, id: string): Promise<CatalogueVersionDto> {
		idValue(id, 'id')
		return this.unit.execute(
			context,
			READ,
			false,
			/** Read the version. */ (w) => this.readVersion(w, id),
		)
	}

	/** Families of a version under one parent. */
	families(
		context: AuthenticatedHcmContext,
		id: string,
		params: URLSearchParams,
	): Promise<JobFamilyPage> {
		idValue(id, 'id')
		const query = parseFamilyQuery(params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Page the families. */ async (w) => {
				await this.readVersion(w, id)
				return w.catalogue.families(id, query)
			},
		)
	}

	/** Job profiles. */
	profiles(context: AuthenticatedHcmContext, params: URLSearchParams): Promise<JobProfilePage> {
		const query = parseProfileQuery(params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Page the profiles. */ (w) => w.catalogue.profiles(query),
		)
	}

	/** One profile version. */
	profileVersion(context: AuthenticatedHcmContext, id: string): Promise<JobProfileVersionDto> {
		idValue(id, 'id')
		return this.unit.execute(
			context,
			READ,
			false,
			/** Read the profile version. */ (w) => this.readProfileVersion(w, id),
		)
	}

	/** Create a draft successor from the published version. */
	createVersion(
		context: AuthenticatedHcmContext,
		catalogueId: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<CatalogueVersionDto> {
		idValue(catalogueId, 'id')
		const command = parseCatalogueVersionCreate(body)
		return this.command(
			context,
			MANAGE,
			'version.create',
			{ catalogueId, command },
			key,
			/** Copy the published version into a new draft. */ async (w) => {
				const catalogue = await w.catalogue.lockCatalogue()
				if (!catalogue || catalogue.id !== catalogueId) throw new HcmDomainError('not-found')
				if (catalogue.currentVersionId !== command.basedOnVersionId)
					invalidField('basedOnVersionId', 'not-current')
				const summary = await w.catalogue.catalogue()
				if (
					summary?.versions.some(
						/** An open draft or review. */ (v) => v.status === 'Draft' || v.status === 'InReview',
					)
				)
					throw new HcmDomainError('invalid-state')
				const versionNumber = catalogue.latestVersionNumber + 1
				const id = `${catalogueId}/v${versionNumber}`
				await w.catalogue.createSuccessor({
					id,
					catalogueId,
					versionNumber,
					basedOnId: command.basedOnVersionId,
					changeSummary: command.changeSummary,
				})
				await this.audit(
					w,
					'job-architecture.catalogue-version-created',
					'job-catalogue-version',
					id,
					requestId,
					command.reason,
					['changeSummary'],
					null,
					'Draft',
				)
				return this.readVersion(w, id)
			},
		)
	}

	/** Add a family, track, level, band or grade to a draft version. */
	addElement(
		context: AuthenticatedHcmContext,
		versionId: string,
		kind: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<CatalogueVersionDto> {
		idValue(versionId, 'id')
		const command = parseElementCreate(kind, body)
		return this.command(
			context,
			MANAGE,
			'element.add',
			{ versionId, command },
			key,
			/** Validate against the draft and insert. */ async (w) => {
				const version = await this.lockDraft(w, versionId, command.expectedRevision)
				await this.requireNewElement(w, version, command)
				await w.catalogue.addElement(
					versionId,
					`${versionId}/${command.kind}/${command.code}`,
					command,
				)
				await w.catalogue.touchVersion(versionId)
				await this.audit(
					w,
					'job-architecture.catalogue-element-added',
					'job-catalogue-version',
					versionId,
					requestId,
					command.reason,
					[command.kind],
					null,
					null,
				)
				return this.readVersion(w, versionId)
			},
		)
	}

	/** Edit, retire or reactivate an element of a draft version. */
	updateElement(
		context: AuthenticatedHcmContext,
		versionId: string,
		kind: string,
		elementId: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<CatalogueVersionDto> {
		idValue(versionId, 'id')
		idValue(elementId, 'elementId')
		const command = parseElementUpdate(kind, body)
		return this.command(
			context,
			MANAGE,
			'element.update',
			{ versionId, elementId, command },
			key,
			/** Validate sequences and update. */ async (w) => {
				const version = await this.lockDraft(w, versionId, command.expectedRevision)
				this.requireFreeSequence(
					version,
					command.kind,
					command.sequence,
					elementId,
					this.parentOf(version, command.kind, elementId),
				)
				if (!(await w.catalogue.updateElement(versionId, elementId, command)))
					throw new HcmDomainError('not-found')
				await w.catalogue.touchVersion(versionId)
				await this.audit(
					w,
					'job-architecture.catalogue-element-updated',
					'job-catalogue-version',
					versionId,
					requestId,
					command.reason,
					[command.kind],
					null,
					null,
				)
				return this.readVersion(w, versionId)
			},
		)
	}

	/** Submit a draft version for review; editing stops. */
	submitVersion(
		context: AuthenticatedHcmContext,
		versionId: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<CatalogueVersionDto> {
		idValue(versionId, 'id')
		const command = parseSubmit(body)
		return this.command(
			context,
			MANAGE,
			'version.submit',
			{ versionId, command },
			key,
			/** Move Draft to InReview. */ async (w) => {
				const lock = await w.catalogue.lockVersion(versionId)
				if (!lock) throw new HcmDomainError('not-found')
				requireRevision(lock.revision, command.expectedRevision)
				requireTransition(lock.status, 'InReview')
				const version = await this.readVersion(w, versionId)
				if (!version.tracks.length || !version.bands.length || !version.familyCount)
					throw new HcmDomainError('record-incomplete')
				await w.catalogue.touchVersion(versionId, { status: 'InReview' })
				await this.audit(
					w,
					'job-architecture.catalogue-version-submitted',
					'job-catalogue-version',
					versionId,
					requestId,
					command.reason,
					['status'],
					'Draft',
					'InReview',
				)
				return this.readVersion(w, versionId)
			},
		)
	}

	/** Publish a reviewed version: close its predecessor and move the catalogue pointer. */
	publishVersion(
		context: AuthenticatedHcmContext,
		versionId: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<CatalogueVersionDto> {
		idValue(versionId, 'id')
		const command = parsePublish(body)
		return this.command(
			context,
			PUBLISH,
			'version.publish',
			{ versionId, command },
			key,
			/** Publish in one transaction. */ async (w) => {
				const catalogue = await w.catalogue.lockCatalogue()
				const lock = await w.catalogue.lockVersion(versionId)
				if (!catalogue || !lock) throw new HcmDomainError('not-found')
				requireRevision(lock.revision, command.expectedRevision)
				requireTransition(lock.status, 'Published')
				const previous = catalogue.currentVersionId
					? await w.catalogue.lockVersion(catalogue.currentVersionId)
					: undefined
				requireEffectiveAfter(previous?.effectiveFrom ?? null, command.effectiveFrom)
				const version = await this.readVersion(w, versionId)
				const families = await w.catalogue.allFamilies(versionId)
				await w.catalogue.publishVersion({
					id: versionId,
					ownerId: catalogue.id,
					effectiveFrom: command.effectiveFrom,
					digest: digest({ tracks: version.tracks, bands: version.bands, families }),
					previous: previous
						? { id: previous.id, effectiveTo: dayBefore(command.effectiveFrom) }
						: null,
				})
				await this.audit(
					w,
					'job-architecture.catalogue-version-published',
					'job-catalogue-version',
					versionId,
					requestId,
					command.reason,
					['status', 'effectiveFrom'],
					'InReview',
					'Published',
				)
				return this.readVersion(w, versionId)
			},
		)
	}

	/** Create a job profile with its first draft version. */
	createProfile(
		context: AuthenticatedHcmContext,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<JobProfileVersionDto> {
		const command = parseProfileCreate(body)
		return this.command(
			context,
			MANAGE,
			'profile.create',
			command,
			key,
			/** Validate references and insert. */ async (w) => {
				await this.requireDraftReferences(w, command.draft)
				const profileId = `job-profile/${randomUUID()}`
				const id = `${profileId}/v1`
				await w.catalogue.createProfile(profileId, command.code, command.name)
				await w.catalogue.insertProfileVersion({
					id,
					profileId,
					versionNumber: 1,
					supersedesId: null,
					draft: command.draft,
				})
				await this.audit(
					w,
					'job-architecture.profile-created',
					'job-profile-version',
					id,
					requestId,
					command.reason,
					['code', 'name'],
					null,
					'Draft',
				)
				return this.readProfileVersion(w, id)
			},
		)
	}

	/** Create a draft successor from the current published profile version. */
	createProfileVersion(
		context: AuthenticatedHcmContext,
		profileId: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<JobProfileVersionDto> {
		idValue(profileId, 'id')
		const command = parseProfileVersionCreate(body)
		return this.command(
			context,
			MANAGE,
			'profile-version.create',
			{ profileId, command },
			key,
			/** Copy the published version into a new draft. */ async (w) => {
				const profile = await w.catalogue.lockProfile(profileId)
				if (!profile) throw new HcmDomainError('not-found')
				if (profile.currentVersionId !== command.basedOnVersionId)
					invalidField('basedOnVersionId', 'not-current')
				const based = await this.readProfileVersion(w, command.basedOnVersionId)
				if (
					based.versions.some(/** Open. */ (v) => v.status === 'Draft' || v.status === 'InReview')
				)
					throw new HcmDomainError('invalid-state')
				const versionNumber = profile.latestVersionNumber + 1
				const id = `${profileId}/v${versionNumber}`
				await w.catalogue.insertProfileVersion({
					id,
					profileId,
					versionNumber,
					supersedesId: based.id,
					draft: {
						catalogueVersionId: based.catalogueVersionId,
						familyId: based.family.id,
						trackId: based.track.id,
						levelId: based.level.id,
						summary: based.summary,
						purpose: based.purpose,
						scopeOfImpact: based.scopeOfImpact,
						autonomyLevel: based.autonomyLevel,
						responsibilities: based.responsibilities,
						requirements: based.requirements,
						allowedGrades: based.allowedGrades.map(
							/** Grade. */ (g) => ({ gradeId: g.gradeId, isDefault: g.isDefault }),
						),
					},
				})
				await this.audit(
					w,
					'job-architecture.profile-version-created',
					'job-profile-version',
					id,
					requestId,
					command.reason,
					['versionNumber'],
					null,
					'Draft',
				)
				return this.readProfileVersion(w, id)
			},
		)
	}

	/** Replace the content of a draft profile version. */
	updateProfileVersion(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<JobProfileVersionDto> {
		idValue(id, 'id')
		const command = parseProfileDraftUpdate(body)
		return this.command(
			context,
			MANAGE,
			'profile-version.update',
			{ id, command },
			key,
			/** Validate and replace the draft. */ async (w) => {
				const lock = await w.catalogue.lockProfileVersion(id)
				if (!lock) throw new HcmDomainError('not-found')
				requireRevision(lock.revision, command.expectedRevision)
				if (lock.status !== 'Draft') throw new HcmDomainError('version-published')
				await this.requireDraftReferences(w, command.draft)
				await w.catalogue.replaceProfileDraft(id, command.draft)
				await this.audit(
					w,
					'job-architecture.profile-version-updated',
					'job-profile-version',
					id,
					requestId,
					command.reason,
					['draft'],
					null,
					null,
				)
				return this.readProfileVersion(w, id)
			},
		)
	}

	/** Submit a draft profile version for review. */
	submitProfileVersion(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<JobProfileVersionDto> {
		idValue(id, 'id')
		const command = parseSubmit(body)
		return this.command(
			context,
			MANAGE,
			'profile-version.submit',
			{ id, command },
			key,
			/** Move Draft to InReview after checking completeness. */ async (w) => {
				const lock = await w.catalogue.lockProfileVersion(id)
				if (!lock) throw new HcmDomainError('not-found')
				requireRevision(lock.revision, command.expectedRevision)
				requireTransition(lock.status, 'InReview')
				const version = await this.readProfileVersion(w, id)
				requireAllowedGrades(version.allowedGrades)
				await w.catalogue.touchProfileVersion(id, { status: 'InReview' })
				await this.audit(
					w,
					'job-architecture.profile-version-submitted',
					'job-profile-version',
					id,
					requestId,
					command.reason,
					['status'],
					'Draft',
					'InReview',
				)
				return this.readProfileVersion(w, id)
			},
		)
	}

	/** Publish a reviewed profile version; existing positions and assignments are untouched. */
	publishProfileVersion(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<JobProfileVersionDto> {
		idValue(id, 'id')
		const command = parsePublish(body)
		return this.command(
			context,
			PUBLISH,
			'profile-version.publish',
			{ id, command },
			key,
			/** Publish in one transaction. */ async (w) => {
				const lock = await w.catalogue.lockProfileVersion(id)
				if (!lock) throw new HcmDomainError('not-found')
				const profile = await w.catalogue.lockProfile(lock.ownerId)
				if (!profile) throw new HcmDomainError('not-found')
				requireRevision(lock.revision, command.expectedRevision)
				requireTransition(lock.status, 'Published')
				const previous = profile.currentVersionId
					? await w.catalogue.lockProfileVersion(profile.currentVersionId)
					: undefined
				requireEffectiveAfter(previous?.effectiveFrom ?? null, command.effectiveFrom)
				const version = await this.readProfileVersion(w, id)
				const { versions: _versions, revision: _revision, status: _status, ...content } = version
				await w.catalogue.publishProfileVersion({
					id,
					ownerId: profile.id,
					effectiveFrom: command.effectiveFrom,
					digest: digest(content),
					previous: previous
						? { id: previous.id, effectiveTo: dayBefore(command.effectiveFrom) }
						: null,
				})
				await this.audit(
					w,
					'job-architecture.profile-version-published',
					'job-profile-version',
					id,
					requestId,
					command.reason,
					['status', 'effectiveFrom'],
					'InReview',
					'Published',
				)
				return this.readProfileVersion(w, id)
			},
		)
	}

	/** Read a version or report it missing. */
	private async readVersion(w: JobArchitectureWork, id: string): Promise<CatalogueVersionDto> {
		const version = await w.catalogue.version(id)
		if (!version) throw new HcmDomainError('not-found')
		return version
	}

	/** Read a profile version or report it missing. */
	private async readProfileVersion(
		w: JobArchitectureWork,
		id: string,
	): Promise<JobProfileVersionDto> {
		const version = await w.catalogue.profileVersion(id)
		if (!version) throw new HcmDomainError('not-found')
		return version
	}

	/** Lock a draft version at the expected revision and read it. */
	private async lockDraft(
		w: JobArchitectureWork,
		id: string,
		expectedRevision: number,
	): Promise<CatalogueVersionDto> {
		const lock = await w.catalogue.lockVersion(id)
		if (!lock) throw new HcmDomainError('not-found')
		requireRevision(lock.revision, expectedRevision)
		if (lock.status !== 'Draft') throw new HcmDomainError('version-published')
		requireDraft(lock.status)
		return this.readVersion(w, id)
	}

	/** The parent (track or band) of a level or grade, used to scope sequences. */
	private parentOf(version: CatalogueVersionDto, kind: string, id: string): string | undefined {
		if (kind === 'levels')
			return version.tracks.find(
				/** Owning track. */ (t) => t.levels.some(/** Level. */ (l) => l.id === id),
			)?.id
		if (kind === 'grades')
			return version.bands.find(
				/** Owning band. */ (b) => b.grades.some(/** Grade. */ (g) => g.id === id),
			)?.id
		return undefined
	}

	/** Sequences are unique per track for levels, per version for bands and per band for grades. */
	private requireFreeSequence(
		version: CatalogueVersionDto,
		kind: string,
		sequence: number | undefined,
		selfId: string | null,
		parentId: string | undefined,
	): void {
		if (sequence === undefined) return
		let siblings: { id: string; sequence: number }[] = []
		if (kind === 'bands') siblings = version.bands
		if (kind === 'levels')
			siblings = version.tracks.find(/** Track. */ (t) => t.id === parentId)?.levels ?? []
		if (kind === 'grades')
			siblings = version.bands.find(/** Band. */ (b) => b.id === parentId)?.grades ?? []
		if (siblings.some(/** Taken. */ (s) => s.sequence === sequence && s.id !== selfId))
			invalidField('sequence', 'duplicate')
	}

	/** Validate a new element against the draft: parents, depth, kinds, codes and sequences. */
	private async requireNewElement(
		w: JobArchitectureWork,
		version: CatalogueVersionDto,
		element: ElementCreate,
	): Promise<void> {
		switch (element.kind) {
			case 'families': {
				const families = await w.catalogue.allFamilies(version.id)
				if (families.some(/** Taken. */ (f) => f.code === element.code))
					invalidField('code', 'duplicate')
				if (element.parentId !== null) {
					const parent = families.find(/** Parent. */ (f) => f.id === element.parentId)
					if (!parent) invalidField('parentId', 'unknown')
					requireFamilyParent(parent?.depth ?? null)
				}
				return
			}
			case 'tracks':
				if (version.tracks.some(/** Taken. */ (t) => t.code === element.code))
					invalidField('code', 'duplicate')
				if (version.tracks.some(/** Kind taken. */ (t) => t.kind === element.trackKind))
					invalidField('kind', 'duplicate')
				return
			case 'levels':
				if (!version.tracks.some(/** Track. */ (t) => t.id === element.trackId))
					invalidField('trackId', 'unknown')
				if (
					version.tracks.some(
						/** Taken. */ (t) => t.levels.some(/** Level. */ (l) => l.code === element.code),
					)
				)
					invalidField('code', 'duplicate')
				this.requireFreeSequence(version, 'levels', element.sequence, null, element.trackId)
				return
			case 'bands':
				if (version.bands.some(/** Taken. */ (b) => b.code === element.code))
					invalidField('code', 'duplicate')
				this.requireFreeSequence(version, 'bands', element.sequence, null, undefined)
				return
			default:
				if (!version.bands.some(/** Band. */ (b) => b.id === element.bandId))
					invalidField('bandId', 'unknown')
				if (
					version.bands.some(
						/** Taken. */ (b) => b.grades.some(/** Grade. */ (g) => g.code === element.code),
					)
				)
					invalidField('code', 'duplicate')
				this.requireFreeSequence(version, 'grades', element.sequence, null, element.bandId)
		}
	}

	/**
	 * A draft references the catalogue's current published version and active elements of it: the
	 * level belongs to the track, and allowed grades belong to the version with exactly one default.
	 */
	private async requireDraftReferences(
		w: JobArchitectureWork,
		draft: JobProfileVersionDraft,
	): Promise<void> {
		const version = await w.catalogue.version(draft.catalogueVersionId)
		if (!version || !version.current || version.status !== 'Published')
			invalidField('catalogueVersionId', 'not-current')
		const families = await w.catalogue.allFamilies(draft.catalogueVersionId)
		if (!families.some(/** Active family. */ (f) => f.id === draft.familyId && f.active))
			invalidField('familyId', 'unknown')
		const track = version?.tracks.find(
			/** Active track. */ (t) => t.id === draft.trackId && t.active,
		)
		if (!track) invalidField('trackId', 'unknown')
		if (!track?.levels.some(/** Active level. */ (l) => l.id === draft.levelId && l.active))
			invalidField('levelId', 'unknown')
		requireAllowedGrades(draft.allowedGrades)
		const grades = new Set(
			(version?.bands ?? []).flatMap(
				/** Active grades. */ (b) =>
					b.grades.filter(/** Active. */ (g) => g.active).map(/** Id. */ (g) => g.id),
			),
		)
		if (draft.allowedGrades.some(/** Foreign grade. */ (g) => !grades.has(g.gradeId)))
			invalidField('allowedGrades', 'unknown')
		requireUniqueCodes(draft.responsibilities, 'responsibilities')
		requireUniqueCodes(draft.requirements, 'requirements')
	}

	/** Record field names and states only; reasons are the user's own explanation. */
	private audit(
		w: JobArchitectureWork,
		action: string,
		targetType: string,
		targetId: string,
		requestId: string,
		reason: string,
		changedFields: string[],
		fromState: string | null,
		toState: string | null,
	) {
		return w.audit.append({
			action,
			category: 'business',
			targetType,
			targetId,
			requestId,
			summary: { reason, changedFields, fromState, toState },
		})
	}

	/** Serialize a write and replay identical retries from the actor's receipt. */
	private command<T>(
		context: AuthenticatedHcmContext,
		permission: string,
		operation: string,
		payload: unknown,
		key: string,
		work: (w: JobArchitectureWork) => Promise<T>,
	): Promise<T> {
		const hash = commandHash(operation, payload)
		return this.unit.execute(
			context,
			permission,
			true,
			/** Keep receipts in the business transaction. */ (w) =>
				runIdempotent(
					w.receipts,
					`job-catalogue.${operation}`,
					key,
					hash,
					/** Run once. */ () => work(w),
				),
		)
	}
}
