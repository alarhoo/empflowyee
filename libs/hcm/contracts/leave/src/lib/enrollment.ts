import {
	dateValue,
	idValue,
	invalidField,
	preservedTextValue,
	readBody,
} from '@empflowyee/hcm-runtime-contract'
import type { LeaveTrackingMode, LeaveUnit, LeaveUnits } from './hcm-leave-contract'

export interface LeaveEnrollmentCommand {
	employmentId: string
	policyVersionId: string
	effectiveFrom: string
	effectiveTo?: string
	reason: string
}
export interface LeavePeriodView {
	id: string
	code: string
	name: string
	startDate: string
	endDate: string
	state: 'Planned' | 'Open' | 'Closing' | 'Closed'
	revision: number
}
export interface LeaveEnrollmentView {
	id: string
	revision: number
	employmentId: string
	policyVersionId: string
	effectiveFrom: string
	effectiveTo: string
	trackingMode: LeaveTrackingMode
	state: 'Pending' | 'Active' | 'Suspended' | 'Ended'
	accountId?: string
}
interface LeaveBalanceIdentity {
	enrollmentId: string
	policyId: string
	periodId: string
	unit: LeaveUnit
	revision: number
}
export type LeaveBalanceView = LeaveBalanceIdentity &
	(
		| {
			trackingMode: 'Balance'
			postedUnits: LeaveUnits
			reservedUnits: LeaveUnits
			availableUnits: LeaveUnits
		}
		| { trackingMode: 'Unpaid'; trackedUnits: LeaveUnits }
	)

/** Validate explicit enrollment selection and preserve the original justification without accepting tenant or balance overrides. */
export function readLeaveEnrollmentCommand(value: unknown): LeaveEnrollmentCommand {
	const body = readBody(
		value,
		['employmentId', 'policyVersionId', 'effectiveFrom', 'reason'],
		['effectiveTo'],
	)
	const effectiveFrom = dateValue(body['effectiveFrom'], 'effectiveFrom')
	const effectiveTo =
		'effectiveTo' in body ? dateValue(body['effectiveTo'], 'effectiveTo') : undefined
	if (effectiveTo !== undefined && effectiveTo < effectiveFrom)
		invalidField('effectiveTo', 'invalid-range')
	return {
		employmentId: idValue(body['employmentId'], 'employmentId'),
		policyVersionId: idValue(body['policyVersionId'], 'policyVersionId'),
		effectiveFrom,
		...(effectiveTo === undefined ? {} : { effectiveTo }),
		reason: preservedTextValue(body['reason'], 'reason', 2000),
	}
}
