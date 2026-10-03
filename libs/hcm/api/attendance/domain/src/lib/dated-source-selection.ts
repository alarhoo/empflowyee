import { dateValue, idValue } from '@empflowyee/hcm-runtime-contract'

export type DatedWorkSource =
	| {
		kind: 'Override'
		id: string
		employmentId: string
		workDate: string
		state: 'Draft' | 'Approved' | 'Cancelled' | 'Superseded'
		revision: number
	}
	| {
		kind: 'Roster'
		id: string
		employmentId: string
		workDate: string
		state: 'Planned' | 'Published' | 'Cancelled' | 'Superseded'
		rosterState:
				'Draft' | 'PendingApproval' | 'Published' | 'Rejected' | 'Cancelled' | 'Superseded'
		revision: number
	}

export type DatedWorkSourceSelection =
	| { state: 'AssignedSchedule' }
	| { state: 'Selected'; source: DatedWorkSource }
	| { state: 'Unavailable'; reason: 'EqualPrecedenceConflict' }

/** Select approved override before published roster; ordinary scope precedence is evaluated only when neither dated source applies. */
export function selectDatedWorkSource(
	employmentId: string,
	workDate: string,
	sources: readonly DatedWorkSource[],
): DatedWorkSourceSelection {
	idValue(employmentId, 'employmentId')
	dateValue(workDate, 'workDate')
	let winner: DatedWorkSource | null = null
	let tied = false
	for (const source of sources) {
		if (source.employmentId !== employmentId || source.workDate !== workDate) continue
		if (source.kind === 'Override' && source.state !== 'Approved') continue
		if (
			source.kind === 'Roster' &&
			(source.state !== 'Published' || source.rosterState !== 'Published')
		)
			continue
		if (!winner || (source.kind === 'Override' && winner.kind === 'Roster')) {
			winner = source
			tied = false
		} else if (winner.kind === source.kind) tied = true
	}
	if (tied) return { state: 'Unavailable', reason: 'EqualPrecedenceConflict' }
	return winner ? { state: 'Selected', source: winner } : { state: 'AssignedSchedule' }
}
