import { HcmAccessError } from '@empflowyee/hcm-api-access-control-application'
import type { EvidenceFileView } from '@empflowyee/hcm-documents-contract'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'
import { parseAttendanceEvidenceStage } from '@empflowyee/hcm-attendance-contract'
import type { StagedEvidence } from '@empflowyee/hcm-documents-contract'
import type { TemplateDownload } from '@empflowyee/hcm-api-documents-application'
import {
	requireIdempotencyKey,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import { idValue } from '@empflowyee/hcm-runtime-contract'
import { AttendanceOverrideUnit } from './overrides'

export class AttendanceEvidence {
	/** Reuse the exact dated Override scope and the Documents owner port. */
	constructor(private readonly unit: AttendanceOverrideUnit) {}
	/** Authorize before consuming bytes; preserve the original subject, uploader, classification and content on retry. */
	stage(
		context: AuthenticatedHcmContext,
		value: unknown,
		key: string,
		bytes: AsyncIterable<Uint8Array>,
		filename: string,
		mediaType: string,
	): Promise<StagedEvidence> {
		const input = parseAttendanceEvidenceStage(value)
		requireIdempotencyKey(key)
		return this.unit.execute(
			context,
			input,
			'manage',
			/** Keep source authority and clean admission in one transaction. */ async (work) => {
				await work.requireEvidence(input.classification)
				const result = await work.evidence.stage(
					{
						purpose: input.purpose,
						subject: JSON.stringify(['Override', input.employmentId, input.workDate]),
						classification: input.classification,
					},
					key,
					bytes,
					filename,
					mediaType,
				)
				if (result.created)
					await work.audit.append({
						action: 'attendance.evidence-staged',
						category: 'business',
						targetType: 'attendance-evidence',
						targetId: result.id,
						requestId: key,
						summary: {
							reason: null,
							changedFields: ['evidence'],
							fromState: null,
							toState: 'Clean',
						},
					})
				return {
					id: result.id,
					validation: result.validation,
					classification: result.classification,
				}
			},
		)
	}
	/** Project only the source's attachments with a current classification grant; denied classes contribute no metadata or counts. */
	list(context: AuthenticatedHcmContext, id: string): Promise<EvidenceFileView[]> {
		idValue(id, 'overrideId')
		return this.unit.execute(
			context,
			{ id },
			'read',
			/** Reuse whole dated source scope before filtering private attachment metadata. */ async (
				work,
			) => {
				const source = await work.read(id)
				if (!source) throw new HcmDomainError('not-found')
				const rows = await work.evidence.list(
					'AttendanceEvidence',
					JSON.stringify(['Override', source.employmentId, source.workDate]),
					source.id,
				)
				const result: EvidenceFileView[] = []
				for (const row of rows) {
					try {
						await work.requireEvidence(row.classification)
					} catch (error) {
						if (error instanceof HcmAccessError && error.code === 'forbidden') continue
						throw error
					}
					result.push(row)
				}
				return result
			},
		)
	}

	/** Audit a currently field-authorized stream; a record-list grant alone never exposes content. */
	async open(
		context: AuthenticatedHcmContext,
		id: string,
		requestId: string,
	): Promise<TemplateDownload> {
		idValue(id, 'evidenceId')
		let opened: Omit<TemplateDownload, 'complete'> | undefined
		try {
			const auditId = await this.unit.execute(
				context,
				{ evidenceId: id },
				'read',
				/** Check immutable binding and separate field authority before touching private bytes. */ async (
					work,
				) => {
					const binding = await work.evidence.inspect(id)
					await work.requireEvidence(binding.classification)
					opened = await work.evidence.open(
						{
							purpose: binding.purpose,
							subject: binding.subject,
							classification: binding.classification,
						},
						id,
					)
					return work.audit.append({
						action: 'document.download-authorized',
						targetType: 'document-business-evidence',
						targetId: id,
						requestId,
						relatedEventId: null,
						summary: {},
					})
				},
			)
			if (!opened) throw new Error('Evidence stream was not opened')
			return {
				...opened,
				complete: /** Reauthorize and record only the observable transport outcome. */ async (
					ok,
				) => {
					await this.unit.execute(
						context,
						{ evidenceId: id },
						'read',
						/** Completion cannot widen the original dated field scope. */ async (work) => {
							const binding = await work.evidence.inspect(id)
							await work.requireEvidence(binding.classification)
							await work.audit.append({
								action: ok ? 'document.download-completed' : 'document.download-failed',
								targetType: 'document-business-evidence',
								targetId: id,
								requestId,
								relatedEventId: auditId,
								summary: {},
							})
						},
					)
				},
			}
		} catch (error) {
			await opened?.close()
			throw error
		}
	}
}
