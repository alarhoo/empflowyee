import { Temporal } from '@js-temporal/polyfill'
import {
	parseHolidayPreview,
	parseConfigurationPublish,
	type HolidayPreviewCommand,
	type HolidayPreviewView,
	type HolidayVersionView,
} from '@empflowyee/hcm-attendance-contract'
import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'
import { commandHash, type AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import {
	resolveHolidays,
	HolidayCollisionError,
	AttendanceTimeError,
} from '@empflowyee/hcm-api-attendance-domain'
import type { WorkforceTimeContextPort } from '@empflowyee/hcm-api-workforce-foundation-application'
import type { AttendancePeriodFencePort, AttendancePeriodBasis } from './period-fences'
import { workdayLocation } from './workday-location'
import { AttendanceHolidayUnitOfWork, type AttendanceHolidayWork } from './holiday-commands'
import { replaySafe } from './schedule-commands'

export interface HolidayImpact {
	digest: string
	conflicts: number
	lockedImpact: boolean
	failureCode: string | null
	affectedEmploymentCount: number
	affectedWorkdayCount: number
}
export interface HolidayPublicationPort {
	/** Persist immutable explicit context and enqueue its durable validation in the current command transaction. */
	start(source: HolidayVersionView, input: HolidayPreviewCommand): Promise<HolidayPreviewView>
	/** Read only actor-bound source preview evidence. */
	read(source: HolidayVersionView, previewId: string): Promise<HolidayPreviewView>
	/** Revalidate current dated context under period fences and consume the actor's exact Ready result. */
	consume(source: HolidayVersionView, previewId: string, digest: string): Promise<void>
}

/** Validate every holiday in its explicit employment timezone; scope and DST conflicts remain safe named failures. */
export async function evaluateHolidayImpact(
	source: HolidayVersionView,
	input: HolidayPreviewCommand,
	workforce: WorkforceTimeContextPort,
	periods: AttendancePeriodFencePort,
): Promise<HolidayImpact> {
	const period: AttendancePeriodBasis[] = []
	let lockedImpact = false
	const facts: string[] = []
	let conflicts = 0,
		failureCode: string | null = null,
		days = 0
	const entries = source.entries.map(
		/** Retain stable ordinal identities during draft validation. */ (entry, i) => ({
			...entry,
			id: String(i),
			versionId: source.versionId,
		}),
	)
	const dates = new Set(
		entries.map(
			/** Review every declared holiday even when the calendar spans multiple years. */ (entry) =>
				entry.observedDate,
		),
	)
	for (
		let date = Temporal.PlainDate.from(input.effectiveFrom);
		Temporal.PlainDate.compare(date, input.effectiveTo) <= 0;
		date = date.add({ days: 1 })
	) {
		dates.add(date.toString())
	}
	let fencedMonth = ''
	for (const workDate of [...dates].sort()) {
		if (workDate.slice(0, 7) !== fencedMonth) {
			// Acquire all month fences in date order, including declared dates outside the bounded view.
			const basis = await periods.fence(workDate, workDate)
			period.push(basis)
			lockedImpact ||= basis.months.some(
				/** Closing or historical locked bases cannot be republished. */ (month) =>
					!!month.period && ['Closing', 'Locked', 'Reopened'].includes(month.period.state),
			)
			fencedMonth = workDate.slice(0, 7)
		}
		const result = await workforce.read(input.employmentId, workDate)
		days++
		if (result.state !== 'Available') {
			failureCode = 'EmploymentContextUnavailable'
			continue
		}
		const location = workdayLocation(result.context, 'Employment', {
			kind: 'Employment',
			id: input.employmentId,
		})
		facts.push(result.context.inputDigest)
		if (!location || location.timezone !== input.timezone) {
			failureCode = 'TimezoneContextChanged'
			continue
		}
		try {
			resolveHolidays(
				workDate,
				input.timezone,
				{ locationId: location.locationId, regionCode: location.region },
				entries,
			)
			// Individually check scoped entries even when the validation employment is outside their scope.
			for (const entry of entries)
				if (entry.observedDate === workDate)
					resolveHolidays(
						workDate,
						input.timezone,
						{ locationId: entry.locationId ?? null, regionCode: entry.regionCode ?? null },
						[entry],
					)
			for (let i = 0; i < entries.length; i++)
				for (let j = i + 1; j < entries.length; j++) {
					const a = entries[i],
						b = entries[j]
					if (
						a.observedDate !== workDate ||
						b.observedDate !== workDate ||
						(a.locationId && b.locationId && a.locationId !== b.locationId) ||
						(a.regionCode && b.regionCode && a.regionCode !== b.regionCode)
					)
						continue
					resolveHolidays(
						workDate,
						input.timezone,
						{
							locationId: a.locationId ?? b.locationId ?? null,
							regionCode: a.regionCode ?? b.regionCode ?? null,
						},
						[a, b],
					)
				}
		} catch (error) {
			if (error instanceof HolidayCollisionError) {
				conflicts++
				failureCode = 'HolidayPriorityCollision'
			} else if (error instanceof AttendanceTimeError) {
				conflicts++
				failureCode = error.message
			} else throw error
		}
	}
	return {
		digest: commandHash('HolidayImpact', {
			source,
			input,
			facts,
			period,
			conflicts,
			lockedImpact,
			failureCode,
		}),
		conflicts,
		lockedImpact,
		failureCode,
		affectedEmploymentCount: 1,
		affectedWorkdayCount: days,
	}
}

/** Holiday publication is gated by a completed durable review and fresh source-owned validation. */
export class AttendanceHolidayPublication {
	/** Reuse current-authority transactions and existing audit/receipt mechanics. */
	constructor(private readonly unit: AttendanceHolidayUnitOfWork) {}
	/** Admit durable preview work only for an exact editable version and explicit context. */
	preview(
		context: AuthenticatedHcmContext,
		id: string,
		version: string,
		key: string,
		value: unknown,
	): Promise<HolidayPreviewView> {
		idValue(id, 'id')
		idValue(version, 'version')
		const input = parseHolidayPreview(value)
		return this.unit.execute(
			context,
			'preview',
			true,
			/** Authorize and retain idempotent acceptance. */ (work) =>
				replaySafe(
					work,
					'Holidays.preview',
					key,
					id + '/' + version,
					input,
					/** Enqueue without reporting unexecuted checks as successful. */ async () => {
						const source = await this.source(work, id, version, input.expectedRevision)
						if (
							input.effectiveFrom < source.effectiveFrom ||
							(source.effectiveTo && input.effectiveTo > source.effectiveTo)
						)
							throw new HcmDomainError('effective-date-out-of-range')
						const preview = await this.port(work).start(source, input)
						work.receipts.setEvidence({
							owner: 'Holiday',
							versionId: version,
							revision: source.revision,
							reason: null,
						})
						await work.audit.append({
							action: 'attendance.configuration-previewed',
							category: 'business',
							targetType: 'attendance-holiday-calendar-version',
							targetId: version,
							requestId: key,
							summary: {
								reason: null,
								changedFields: ['configuration'],
								fromState: 'Draft',
								toState: 'Draft',
							},
						})
						return preview
					},
				),
		)
	}
	/** Poll only the authenticated actor's preview for the selected exact source. */
	read(
		context: AuthenticatedHcmContext,
		id: string,
		version: string,
		previewId: string,
	): Promise<HolidayPreviewView> {
		idValue(id, 'id')
		idValue(version, 'version')
		idValue(previewId, 'previewId')
		return this.unit.execute(
			context,
			'read',
			false,
			/** Resolve the hidden source before preview evidence. */ async (work) => {
				const source = await work.holidayCalendars.read(id, version)
				if (!source) throw new HcmDomainError('not-found')
				return this.port(work).read(source, previewId)
			},
		)
	}
	/** Consume only a current conflict-free review and atomically freeze content, reason, audit and result. */
	publish(
		context: AuthenticatedHcmContext,
		id: string,
		version: string,
		key: string,
		value: unknown,
	): Promise<HolidayVersionView> {
		idValue(id, 'id')
		idValue(version, 'version')
		const input = parseConfigurationPublish(value)
		return this.unit.execute(
			context,
			'publish',
			true,
			/** Recheck publication authority before command recovery. */ (work) =>
				replaySafe(
					work,
					'Holidays.publish',
					key,
					id + '/' + version,
					input,
					/** Revalidate the dated source evidence before changing lifecycle. */ async () => {
						const source = await this.source(work, id, version, input.expectedRevision)
						await this.port(work).consume(source, input.previewId, input.digest)
						await work.holidayCalendars.publish(id, version, source.revision, input.digest)
						work.receipts.setEvidence({
							owner: 'Holiday',
							versionId: version,
							revision: source.revision + 1,
							reason: input.reason,
						})
						await work.audit.append({
							action: 'attendance.configuration-published',
							category: 'business',
							targetType: 'attendance-holiday-calendar-version',
							targetId: version,
							requestId: key,
							summary: {
								reason: null,
								changedFields: ['configuration'],
								fromState: 'Draft',
								toState: 'Published',
							},
						})
						const result = await work.holidayCalendars.read(id, version)
						if (!result) throw new HcmDomainError('not-found')
						return result
					},
				),
		)
	}
	/** Fail closed when the composition has not supplied real publication dependencies. */
	private port(work: AttendanceHolidayWork): HolidayPublicationPort {
		if (!work.publication) throw new HcmDomainError('record-incomplete')
		return work.publication
	}
	/** Reject foreign, stale and immutable versions before deriving any impact. */
	private async source(
		work: AttendanceHolidayWork,
		id: string,
		version: string,
		revision: number,
	): Promise<HolidayVersionView> {
		const source = await work.holidayCalendars.lock(id, version)
		if (!source) throw new HcmDomainError('not-found')
		if (source.revision !== revision) throw new HcmDomainError('revision-conflict')
		if (source.state !== 'Draft') throw new HcmDomainError('invalid-state')
		return source
	}
}
