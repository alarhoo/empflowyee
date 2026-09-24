import { HcmAccessError } from '@empflowyee/hcm-api-access-control-application'
import { createHash, randomUUID } from 'node:crypto'
import { DocumentError, documentId } from '@empflowyee/hcm-documents-contract'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import { DocumentFiles, type DocumentFile, type OpenDocumentFile } from './document-files'
export interface FileIntent {
	kind: string
	targetId: string
	value: { reason: string; expectedRevision?: number }
}
export interface FileReservation<R> {
	id: string
	aggregateId: string
	state: 'Staged' | 'Ready' | 'Failed'
	payloadHash: string
	file: DocumentFile
	result: R | null
}
export interface FileRepository<I extends FileIntent, R> {
	/** Verify the aggregate or subject before reserving or publishing. */ validate(
		intent: I,
	): Promise<void>
	/** Resolve only actor-bound prior attempts. */ find(
		operation: string,
		key: string,
	): Promise<FileReservation<R> | null>
	/** Store immutable evidence without exposing a business result. */ reserve(
		intent: I,
		key: string,
		hash: string,
		file: DocumentFile,
	): Promise<FileReservation<R>>
	/** Publish business state and evidence in the final transaction. */ finish(
		intent: I,
		key: string,
		reservation: FileReservation<R>,
		requestId: string,
	): Promise<R>
	/** Resolve one Ready attachment through its authorized parent. */ download(
		id: string,
		versionId: string,
	): Promise<DocumentFile>
	/** Append authorized download evidence in the shared transaction. */ auditDownload(
		id: string,
		requestId: string,
		phase: 'Authorized' | 'Completed' | 'Failed',
		relatedId?: string,
	): Promise<string>
}
export interface FileUnit<I extends FileIntent, R, P extends FileRepository<I, R>> {
	/** Bind work to current persisted permission and tenant. */ execute<T>(
		context: AuthenticatedHcmContext,
		permission: string,
		write: boolean,
		work: (repo: P) => Promise<T>,
	): Promise<T>
	/** Terminate only an already reserved actor-owned upload. */ fail(
		context: AuthenticatedHcmContext,
		reservationId: string,
	): Promise<void>
}
export interface TemplateDownload extends OpenDocumentFile {
	file: DocumentFile
	/** Record the observable outcome separately from initial authorization. */ complete(
		ok: boolean,
	): Promise<void>
}
export class DocumentFileCommands<I extends FileIntent, R, P extends FileRepository<I, R>> {
	/** Share the storage protocol while each owning repository controls its own subject and lifecycle. */
	constructor(
		protected readonly unit: FileUnit<I, R, P>,
		private readonly files: DocumentFiles,
		private readonly managePermission: string,
		private readonly downloadPermission: string,
	) {}
	/** Follow explicit stage/reserve/publish/finalize boundaries; a failed phase never returns success. */
	async upload(
		context: AuthenticatedHcmContext,
		intent: I,
		key: string,
		requestId: string,
		bytes: AsyncIterable<Uint8Array>,
		filename: string,
		mediaType: string,
	): Promise<R> {
		await this.unit.execute(
			context,
			this.managePermission,
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
			this.managePermission,
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
				this.managePermission,
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
				this.downloadPermission,
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
					this.downloadPermission,
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
