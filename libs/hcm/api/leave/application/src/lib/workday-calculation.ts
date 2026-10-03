import type { AttendancePublishedWorkdayPort } from '@empflowyee/hcm-api-attendance-application'
import {
	calculateLeaveDayQuantity,
	sumLeaveUnits,
	type LeaveDayQuantity,
	type LeaveResolvedPortion,
} from '@empflowyee/hcm-api-leave-domain'
import { commandHash } from '@empflowyee/hcm-api-runtime-application'
import type {
	LeaveEnrollmentView,
	LeavePeriodView,
	LeavePolicyVersionView,
	LeaveUnits,
} from '@empflowyee/hcm-leave-contract'
import { HcmDomainError, dateValue, invalidField } from '@empflowyee/hcm-runtime-contract'

/** Private source references supplied only after the caller authorizes the selected employment and locks period/policy/enrollment. */
export interface LeaveCalculationAdmission {
	enrollment: LeaveEnrollmentView & { periodId: string }
	period: LeavePeriodView
	policy: LeavePolicyVersionView
}
export interface LeaveResolvedRequestDay {
	workDate: string
	request: LeaveResolvedPortion
}
export interface LeaveCalculatedWorkday {
	workDate: string
	workday: { id: string; revision: number; digest: string } | null
	quantity: LeaveDayQuantity
}
export type LeaveWorkdayCalculation =
	| { state: 'Available'; units: LeaveUnits; digest: string; days: LeaveCalculatedWorkday[] }
	| { state: 'Unavailable'; days: LeaveCalculatedWorkday[] }

/** Require one active enrollment, open period and published policy range before reading another owner's dated facts. */
export function requireLeaveCalculationRange(
	admission: LeaveCalculationAdmission,
	days: readonly { workDate: string }[],
): { employmentId: string; from: string; to: string } {
	if (days.length === 0 || days.length > 366) invalidField('days')
	const { enrollment, period, policy } = admission
	if (enrollment.state !== 'Active' || period.state !== 'Open' || policy.state !== 'Published')
		throw new HcmDomainError('invalid-state')
	if (
		enrollment.policyVersionId !== policy.versionId ||
		enrollment.periodId !== period.id ||
		enrollment.trackingMode !== policy.trackingMode
	)
		throw new HcmDomainError('record-incomplete')
	const dates = days
		.map(
			/** Validate exact local dates without converting them through a browser timezone. */ (day) =>
				dateValue(day.workDate, 'workDate'),
		)
		.sort()
	if (new Set(dates).size !== dates.length) invalidField('days', 'duplicate')
	const from = dates[0],
		to = dates[dates.length - 1]
	if (Date.parse(to) - Date.parse(from) > 365 * 86_400_000) invalidField('days', 'range-too-large')
	if (
		from < period.startDate ||
		to > period.endDate ||
		from < enrollment.effectiveFrom ||
		to > enrollment.effectiveTo ||
		from < policy.effectiveFrom ||
		(policy.effectiveTo !== undefined && to > policy.effectiveTo)
	)
		invalidField('days', 'cross-period-or-version')
	return { employmentId: enrollment.employmentId, from, to }
}

/** Calculate exact rows from an already authorized current owner port after validating one period/version range. */
export async function calculateLeaveWorkdays(
	workdays: AttendancePublishedWorkdayPort,
	admission: LeaveCalculationAdmission,
	days: readonly LeaveResolvedRequestDay[],
): Promise<LeaveWorkdayCalculation> {
	const query = requireLeaveCalculationRange(admission, days)
	const { enrollment, period, policy } = admission
	const { from, to } = query
	const page = await workdays.read(query)
	const sources = new Map(
		page.items.map(
			/** Index only the exact source owner's dated result. */ (day) => [day.workDate, day],
		),
	)
	if (
		sources.size !== page.items.length ||
		page.items.some(
			/** A mismatched or extra subject cannot become another employment's quantity evidence. */ (
				day,
			) => day.employmentId !== enrollment.employmentId || day.workDate < from || day.workDate > to,
		)
	)
		throw new HcmDomainError('record-incomplete')
	const rows = [...days]
		.sort(
			/** Produce deterministic local-date evidence without changing the submitted array. */ (
				left,
				right,
			) => left.workDate.localeCompare(right.workDate),
		)
		.map(
			/** Keep unavailable dates visible rather than summing a partial request. */ (
				day,
			): LeaveCalculatedWorkday => {
				const source = sources.get(day.workDate)
				return {
					workDate: day.workDate,
					workday:
						source?.state === 'Published'
							? { id: source.id, revision: source.revision, digest: source.digest }
							: null,
					quantity: source
						? calculateLeaveDayQuantity(source, day.request, policy)
						: { state: 'Unavailable', reason: 'WorkdayUnavailable' },
				}
			},
		)
	const quantities: LeaveUnits[] = []
	for (const row of rows) {
		if (row.quantity.state !== 'Available') return { state: 'Unavailable', days: rows }
		quantities.push(row.quantity.units)
	}
	return {
		state: 'Available',
		units: sumLeaveUnits(quantities),
		days: rows,
		digest: commandHash('LeaveWorkdayCalculation:1', {
			enrollment: {
				id: enrollment.id,
				revision: enrollment.revision,
				employmentId: enrollment.employmentId,
			},
			period: { id: period.id, revision: period.revision },
			policy: { id: policy.versionId, revision: policy.revision },
			requests: days,
			rows,
		}),
	}
}
