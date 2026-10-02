import type { HolidayReferencePort } from '@empflowyee/hcm-api-attendance-application'
import type { WorkforcePortBinder } from '@empflowyee/hcm-api-workforce-foundation-application'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'
import type { HolidayReferenceKind } from '@empflowyee/hcm-attendance-contract'

/** Reuse Workforce owner reads and project only fields needed by the calendar controls. */
export class KyselyHolidayReferences implements HolidayReferencePort {
	/** Receive ports already bound to the authorized tenant transaction. */
	constructor(private readonly workforce: ReturnType<WorkforcePortBinder['bind']>) {}
	/** Do not expose internal owner cursors or private fields in a reference search. */
	async options(kind: HolidayReferenceKind, q: string, asOf: string) {
		if (kind === 'workers') {
			const page = await this.workforce.records.records({ q, sort: 'name' }, { limit: 100 }, asOf)
			return {
				items: page.items.map(
					/** Names and reference codes are sufficient to distinguish workers. */ (item) => ({
						id: item.workerId,
						code: item.workerNumber,
						name: item.displayName,
					}),
				),
				hasMore: !!page.nextCursor,
			}
		}
		const page = await this.workforce.structure.options(
			kind,
			{ q, sort: 'name:asc', limit: 100, activeOnly: false },
			asOf,
		)
		return {
			items: page.items.map(
				/** Omit structure maintenance metadata and actions. */ (item) => ({
					id: item.id,
					code: item.code,
					name: item.name,
				}),
			),
			hasMore: !!page.nextCursor,
		}
	}
	/** Preserve each employment explicitly while omitting private HR and assignment details. */
	async employments(workerId: string, asOf: string) {
		const context = await this.workforce.changes.context(workerId, asOf)
		if (!context) throw new HcmDomainError('not-found')
		return {
			employments: context.employments.map(
				/** The UI selects an employment, never an implicit primary fallback. */ (item) => ({
					employmentId: item.employmentId,
					legalEntityName: item.legalEntity?.name ?? null,
				}),
			),
		}
	}
	/** Omit salary, management and other HR change fields from dated scope choices. */
	async assignmentOptions(workerId: string, asOf: string) {
		const context = await this.workforce.changes.context(workerId, asOf)
		if (!context) throw new HcmDomainError('not-found')
		return {
			employments: context.employments.map(
				/** Keep concurrent employment choices explicit. */ (item) => ({
					employmentId: item.employmentId,
					legalEntityName: item.legalEntity?.name ?? null,
				}),
			),
			assignments: context.assignments
				.filter(
					/** Include only assignment coverage on the selected date. */ (item) =>
						(!item.effectiveFrom || item.effectiveFrom <= asOf) &&
						(!item.effectiveTo || item.effectiveTo >= asOf),
				)
				.map(
					/** Use organizational labels rather than private HR facts. */ (item) => ({
						id: item.assignmentId,
						employmentId: item.employmentId,
						name: [item.unit?.name, item.location?.name, item.jobTitle].filter(Boolean).join(' · '),
					}),
				),
		}
	}
}
