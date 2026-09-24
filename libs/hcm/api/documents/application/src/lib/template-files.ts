import { HcmAccessError } from '@empflowyee/hcm-api-access-control-application'
import { createHash, randomUUID } from 'node:crypto'
import {
	DocumentError,
	documentId,
	parseTemplateCreate,
	parseTemplateAppend,
	type TemplateCreate,
	type TemplateAppend,
	type DocumentTemplate,
	type DocumentVersion,
	type TemplateQuery,
	type VersionQuery,
	type DocumentPage,
	type TemplateUploadResult,
	type DocumentTypeQuery,
} from '@empflowyee/hcm-documents-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import { DocumentFiles, type DocumentFile, type OpenDocumentFile } from './document-files'

export type TemplateIntent =
	| { kind: 'template-create'; targetId: string; value: TemplateCreate }
	| { kind: 'template-append'; targetId: string; value: TemplateAppend }
export interface UploadReservation {
	id: string
	aggregateId: string
	state: 'Staged' | 'Ready' | 'Failed'
	payloadHash: string
	file: DocumentFile
	result: TemplateUploadResult | null
}
export interface TemplateFileRepository {
	/** Query only template metadata under current read authority. */
	list(query: TemplateQuery): Promise<DocumentPage<DocumentTemplate>>
	/** Read one exact tenant-owned template without revealing foreign records. */
	get(id: string): Promise<DocumentTemplate>
	/** Project only committed Ready versions. */
	versions(id: string, query: VersionQuery): Promise<DocumentPage<DocumentVersion>>
	/** Supply enabled type choices under template-management authority. */
	types(
		query: DocumentTypeQuery,
	): Promise<DocumentPage<{ id: string; code: string; label: string }>>
	/** Revalidate enabled type or exact existing aggregate revision. */
	validate(intent: TemplateIntent): Promise<void>
	/** Inspect one actor/operation-bound reservation. */
	find(operation: string, key: string): Promise<UploadReservation | null>
	/** Persist a staged file and enough safe intent for an authenticated retry. */
	reserve(
		intent: TemplateIntent,
		key: string,
		hash: string,
		file: DocumentFile,
	): Promise<UploadReservation>
	/** Commit Ready bytes, version, audit and response receipt atomically. */
	finish(
		intent: TemplateIntent,
		key: string,
		reservation: UploadReservation,
		requestId: string,
	): Promise<TemplateUploadResult>
	/** Read only a Ready file attached to the specified template/version. */
	download(id: string, versionId: string): Promise<DocumentFile>
	/** Append authorization before releasing bytes or record an observed related outcome. */
	auditDownload(
		id: string,
		requestId: string,
		phase: 'Authorized' | 'Completed' | 'Failed',
		relatedId?: string,
	): Promise<string>
}
export abstract class TemplateFileUnitOfWork {
	/** Authorize from persisted grants inside the tenant transaction. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		permission: string,
		write: boolean,
		work: (repo: TemplateFileRepository) => Promise<T>,
	): Promise<T>
	/** Mark only a previously reserved actor-owned attempt failed; never perform a business mutation. */
	abstract fail(context: AuthenticatedHcmContext, reservationId: string): Promise<void>
}
export interface TemplateDownload extends OpenDocumentFile {
	file: DocumentFile
	/** Record observable stream completion separately from initial authorization. */ complete(
		ok: boolean,
	): Promise<void>
}
export class TemplateFiles {
	/** Compose authorized metadata transactions with durable private storage. */
	constructor(
		private readonly unit: TemplateFileUnitOfWork,
		private readonly files: DocumentFiles,
	) {}
	/** Read a bounded template list through the owning query repository. */
	list(context: AuthenticatedHcmContext, query: TemplateQuery) {
		return this.unit.execute(
			context,
			'templates.read',
			false,
			/** Preserve server query ownership. */ (repo) => repo.list(query),
		)
	}
	/** Read a selected aggregate for the routed detail page. */
	get(context: AuthenticatedHcmContext, id: string) {
		documentId(id)
		return this.unit.execute(
			context,
			'templates.read',
			false,
			/** Resolve one tenant-owned target. */ (repo) => repo.get(id),
		)
	}
	/** Query the selected object's immutable versions. */
	versions(context: AuthenticatedHcmContext, id: string, query: VersionQuery) {
		documentId(id)
		return this.unit.execute(
			context,
			'templates.read',
			false,
			/** Scope children to the selected aggregate. */ (repo) => repo.versions(id, query),
		)
	}
	/** List enabled type choices without requiring classification-management permission. */
	types(context: AuthenticatedHcmContext, query: DocumentTypeQuery) {
		if (query.enabled !== true) throw new DocumentError('invalid-request')
		return this.unit.execute(
			context,
			'templates.manage',
			false,
			/** Return only bounded picker fields. */ (repo) => repo.types(query),
		)
	}
	/** Parse and authorize target metadata before transport starts streaming the file. */
	async prepare(
		context: AuthenticatedHcmContext,
		target: string | null,
		body: unknown,
		key: string,
	): Promise<TemplateIntent> {
		if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))
			throw new DocumentError('invalid-request')
		let intent: TemplateIntent
		if (target === null)
			intent = { kind: 'template-create', targetId: '', value: parseTemplateCreate(body) }
		else
			intent = {
				kind: 'template-append',
				targetId: documentId(target),
				value: parseTemplateAppend(body),
			}
		await this.unit.execute(
			context,
			'templates.manage',
			false,
			/** Existing receipt replay remains possible after its original revision changes. */ async (
				repo,
			) => {
				if (!(await repo.find(intent.kind, key))) await repo.validate(intent)
			},
		)
		return intent
	}
	/** Follow explicit stage/reserve/publish/finalize boundaries; a failed phase never returns success. */
	async upload(
		context: AuthenticatedHcmContext,
		intent: TemplateIntent,
		key: string,
		requestId: string,
		bytes: AsyncIterable<Uint8Array>,
		filename: string,
		mediaType: string,
	): Promise<TemplateUploadResult> {
		await this.unit.execute(
			context,
			'templates.manage',
			false,
			/** Authorize before the first byte is stored even for internal callers. */ async (repo) => {
				if (!(await repo.find(intent.kind, key))) await repo.validate(intent)
			},
		)
		const file = await this.files.stage(bytes, filename, mediaType)
		const hash = createHash('sha256')
			.update(JSON.stringify([intent, file.sha256, file.byteLength, file.mediaType, file.filename]))
			.digest('hex')
		const reservation = await this.unit.execute(
			context,
			'templates.manage',
			true,
			/** Reserve immutable intent after current authority and revision checks. */ async (repo) => {
				const prior = await repo.find(intent.kind, key)
				if (prior) {
					if (prior.payloadHash !== hash) throw new DocumentError('idempotency-conflict')
					return prior
				}
				await repo.validate(intent)
				return repo.reserve(
					{ ...intent, targetId: intent.targetId || randomUUID() },
					key,
					hash,
					file,
				)
			},
		)
		if (reservation.state === 'Failed') throw new DocumentError('upload-failed')
		if (reservation.state === 'Ready' && reservation.result) return reservation.result
		try {
			await this.files.publish(reservation.file)
			return await this.unit.execute(
				context,
				'templates.manage',
				true,
				/** Reauthorize after the filesystem boundary and return only committed versions. */ async (
					repo,
				) => {
					const current = await repo.find(intent.kind, key)
					if (!current || current.state === 'Failed') throw new DocumentError('upload-failed')
					if (current.state === 'Ready' && current.result) return current.result
					await repo.validate(intent)
					const opened = await this.files.open(current.file)
					await opened.close()
					return repo.finish(intent, key, current, requestId)
				},
			)
		} catch (error) {
			// Availability failures remain resumable; invalidated authority/revision is terminal.
			if (
				error instanceof HcmAccessError ||
				(error instanceof DocumentError &&
					['revision-conflict', 'type-disabled', 'not-found'].includes(error.code))
			)
				await this.unit.fail(context, reservation.id)
			throw error
		}
	}
	/** Authorize and open before append, then expose bytes only after the audit transaction commits. */
	async download(
		context: AuthenticatedHcmContext,
		id: string,
		versionId: string,
		requestId: string,
	): Promise<TemplateDownload> {
		documentId(id)
		documentId(versionId)
		let opened: OpenDocumentFile | undefined
		try {
			const authorized = await this.unit.execute(
				context,
				'templates.download',
				true,
				/** Open verified bytes and append evidence within the authorized scope. */ async (
					repo,
				) => {
					const file = await repo.download(id, versionId)
					opened = await this.files.open(file)
					const auditId = await repo.auditDownload(versionId, requestId, 'Authorized')
					return { file, auditId }
				},
			)
			if (!opened) throw new DocumentError('storage-unavailable')
			/** Record an observed stream result with a fresh authority check. */
			const complete = async (ok: boolean): Promise<void> => {
				await this.unit.execute(
					context,
					'templates.download',
					true,
					/** Append one bounded completion event. */ (repo) =>
						repo.auditDownload(
							versionId,
							requestId,
							ok ? 'Completed' : 'Failed',
							authorized.auditId,
						),
				)
			}
			return { ...opened, file: authorized.file, complete }
		} catch (error) {
			await opened?.close()
			throw error
		}
	}
}
