import { Temporal } from '@js-temporal/polyfill'
import { HcmDomainError } from '@empflowyee/hcm-runtime-contract'
import type {
	AttendanceScopeTarget,
	ParsedHolidayAssignment,
	HolidayAssignmentView,
} from '@empflowyee/hcm-attendance-contract'
import type { HcmScopeSubject } from '@empflowyee/hcm-api-access-control-application'
import type { WorkforceTimeContext } from '@empflowyee/hcm-api-workforce-foundation-application'
import type { HolidayAssignmentWork } from './holiday-assignments'

export type AttendanceAssignmentPreparation = Pick<
	HolidayAssignmentWork,
	'workforce' | 'subjects' | 'periods' | 'guardPeriods' | 'authorize' | 'end'
> & {
	/** Read the predecessor's dated ownership without requiring resource-specific display fields. */
	read(
		id: string,
	): Promise<Pick<
		HolidayAssignmentView,
		'id' | 'revision' | 'target' | 'effectiveFrom' | 'effectiveTo'
	> | null>
}
/** Preserve the scope predicate itself so a narrow employment grant cannot authorize a broad future assignment. */
export function attendanceTargetSubject(target: AttendanceScopeTarget): HcmScopeSubject {
	const fields = {
		LegalEntity: 'legalEntityId',
		OrgUnit: 'orgUnitId',
		Department: 'departmentId',
		Location: 'locationId',
		Assignment: 'assignmentId',
		Employment: 'employmentId',
	} as const
	return target.kind === 'Tenant' ? {} : { [fields[target.kind]]: target.id }
}

/** Project dated source facts per assignment; no cross-employment or cross-assignment dimension mixing. */
function scopeSubjects(facts: WorkforceTimeContext): HcmScopeSubject[] {
	const base = { employmentId: facts.employmentId, legalEntityId: facts.legalEntityId }
	return facts.assignments.length
		? facts.assignments.map(
			/** Retain the complete predicate of each effective Workforce assignment. */ (
				assignment,
			) => ({
				...base,
				assignmentId: assignment.id,
				orgUnitId: assignment.orgUnitId,
				locationId: assignment.locationId,
				...(assignment.departmentId ? { departmentId: assignment.departmentId } : {}),
			}),
		)
		: [base]
}

/** Reuse exact scope authorization, locked-period fences and atomic supersession across Attendance configuration families. */
export async function prepareAttendanceAssignment(
	work: AttendanceAssignmentPreparation,
	input: ParsedHolidayAssignment,
	dates: readonly string[],
): Promise<WorkforceTimeContext[]> {
	await work.guardPeriods(input.effectiveFrom, input.effectiveTo)
	const contexts: WorkforceTimeContext[] = [],
		scopes: HcmScopeSubject[] = [attendanceTargetSubject(input.target)]
	let unavailableFacts = false
	for (const date of dates) {
		let after: string | undefined
		do {
			const page = await work.subjects.page(date, input.target, after, 100)
			for (const subject of page.items) {
				const facts = await work.workforce.read(subject.employmentId, date)
				if (facts.state !== 'Available') {
					unavailableFacts = true
					scopes.push({ employmentId: subject.employmentId })
					continue
				}
				contexts.push(facts.context)
				scopes.push(...scopeSubjects(facts.context))
			}
			after = page.nextAfterEmploymentId ?? undefined
		} while (after)
	}
	await work.authorize(scopes)
	if (unavailableFacts) throw new HcmDomainError('record-incomplete')
	for (const date of dates) {
		const basis = await work.periods.fence(date, date)
		if (
			basis.months.some(
				/** Ordinary assignments cannot rewrite locked period inputs. */ (month) =>
					month.period && ['Closing', 'Locked', 'Reopened'].includes(month.period.state),
			)
		)
			throw new HcmDomainError('invalid-state')
	}
	if (input.supersedes) {
		const previous = await work.read(input.supersedes.id)
		if (!previous) throw new HcmDomainError('not-found')
		if (previous.revision !== input.supersedes.expectedRevision)
			throw new HcmDomainError('revision-conflict')
		if (
			previous.target.kind !== input.target.kind ||
			(previous.target.kind !== 'Tenant' &&
				input.target.kind !== 'Tenant' &&
				previous.target.id !== input.target.id) ||
			previous.effectiveFrom >= input.effectiveFrom ||
			(previous.effectiveTo && previous.effectiveTo < input.effectiveFrom)
		)
			throw new HcmDomainError('invalid-state')
		await work.end(
			previous.id,
			previous.revision,
			Temporal.PlainDate.from(input.effectiveFrom).subtract({ days: 1 }).toString(),
		)
	}
	return contexts
}
