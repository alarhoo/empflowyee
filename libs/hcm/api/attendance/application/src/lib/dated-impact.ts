import { Temporal } from '@js-temporal/polyfill'
import type {
	DatedConfigurationFamily,
	DatedConfigurationPreviewCommand,
	ScheduleVersionView,
	ShiftVersionView,
} from '@empflowyee/hcm-attendance-contract'
import { commandHash } from '@empflowyee/hcm-api-runtime-application'
import type { WorkforceTimeContextPort } from '@empflowyee/hcm-api-workforce-foundation-application'
import type {
	AttendanceConfigurationFamily,
	AttendanceConfigurationInput,
	AttendanceConfigurationInputPort,
} from './configuration-inputs'
import type { AttendancePeriodFencePort } from './period-fences'
import { AssignedWorkdayResolver } from './assigned-workday'

export type DatedConfigurationVersion = ScheduleVersionView | ShiftVersionView
export interface DatedConfigurationImpact {
	digest: string
	conflicts: number
	lockedImpact: boolean
	failureCode: string | null
	affectedEmploymentCount: number
	affectedWorkdayCount: number
}

/** Construct a hypothetical schedule input for review only; no synthetic assignment or shift projection is persisted as a workday. */
function proposedInputs(
	source: DatedConfigurationVersion,
	family: DatedConfigurationFamily,
	employmentId: string,
	workDate: string,
	actual: AttendanceConfigurationInputPort,
	workforce: WorkforceTimeContextPort,
): AttendanceConfigurationInputPort {
	const schedule: ScheduleVersionView =
		'days' in source
			? source
			: {
				...source,
				isTemplate: false,
				weekStartsOn: 1,
				days: Array.from(
					{ length: 7 },
					/** A reusable shift is tested on the selected date, independent of display week order. */ (
						_,
						index,
					) => ({ weekday: index + 1, kind: 'Work' as const, segments: source.segments }),
				),
			}
	return {
		/** Replace only the proposed schedule input; actual policy, holiday and prior history remain owner-supplied facts. */
		async read<Family extends AttendanceConfigurationFamily>(
			requested: Family,
			employment: string,
			date: string,
		): Promise<AttendanceConfigurationInput<Family>> {
			if (
				requested !== 'Schedule' ||
				employment !== employmentId ||
				date < source.effectiveFrom ||
				(source.effectiveTo && date > source.effectiveTo) ||
				(family === 'Shift' && date !== workDate)
			)
				return actual.read(requested, employment, date)
			const facts = await workforce.read(employment, date)
			if (facts.state !== 'Available')
				return { state: 'Unavailable', family: requested, reason: facts.reason }
			const result: AttendanceConfigurationInput<'Schedule'> = {
				state: 'Available',
				family: 'Schedule',
				workforce: facts.context,
				version: schedule,
				assignment: {
					id: 'proposed:' + source.versionId,
					revision: source.revision,
					versionId: source.versionId,
					target: { kind: 'Employment', id: employment },
					effectiveFrom: source.effectiveFrom,
					effectiveTo: source.effectiveTo ?? null,
				},
				digest: commandHash('ProposedScheduleInput', {
					family,
					source,
					employment,
					date,
					workforce: facts.context.inputDigest,
				}),
			}
			return result as AttendanceConfigurationInput<Family>
		},
		/** Keep observed-date selection and actual holiday entry identities with the existing owning resolver. */
		holidayForWorkforce: (facts, date) => actual.holidayForWorkforce(facts, date),
	}
}

/** Review a bounded dated candidate using the production resolver, independent rest rules and real policy/calendar sources. */
export async function evaluateDatedConfigurationImpact(
	source: DatedConfigurationVersion,
	family: DatedConfigurationFamily,
	input: DatedConfigurationPreviewCommand,
	actual: AttendanceConfigurationInputPort,
	workforce: WorkforceTimeContextPort,
	periods: AttendancePeriodFencePort,
): Promise<DatedConfigurationImpact> {
	const period = await periods.fence(input.effectiveFrom, input.effectiveTo)
	const lockedImpact = period.months.some(
		/** Preserve historical period locks during any ordinary publication review. */ (month) =>
			!!month.period && ['Closing', 'Locked', 'Reopened'].includes(month.period.state),
	)
	const results = []
	let conflicts = 0,
		failureCode: string | null = null
	for (
		let date = Temporal.PlainDate.from(input.effectiveFrom);
		Temporal.PlainDate.compare(date, input.effectiveTo) <= 0;
		date = date.add({ days: 1 })
	) {
		const workDate = date.toString()
		const result = await new AssignedWorkdayResolver(
			proposedInputs(source, family, input.employmentId, workDate, actual, workforce),
			366,
		).resolve(input.employmentId, workDate)
		results.push({ workDate, result })
		if (result.state === 'Unavailable') {
			conflicts++
			failureCode ??= result.reason
		}
	}
	return {
		digest: commandHash('DatedConfigurationImpact', { family, source, input, period, results }),
		conflicts,
		lockedImpact,
		failureCode,
		affectedEmploymentCount: 1,
		affectedWorkdayCount: results.length,
	}
}
