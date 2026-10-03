import { expect, it } from 'vitest'
import { selectDatedWorkSource, type DatedWorkSource } from './dated-source-selection'

const roster: DatedWorkSource = {
	kind: 'Roster',
	id: 'entry',
	employmentId: 'employment',
	workDate: '2026-10-05',
	state: 'Published',
	rosterState: 'Published',
	revision: 2,
}
const override: DatedWorkSource = {
	kind: 'Override',
	id: 'override',
	employmentId: 'employment',
	workDate: '2026-10-05',
	state: 'Approved',
	revision: 2,
}

it('selects approved override before published roster in either input order', /** A lower precedence source never replaces an approved dated exception. */ () => {
	for (const sources of [
		[roster, override],
		[override, roster],
	])
		expect(selectDatedWorkSource('employment', '2026-10-05', sources)).toEqual({
			state: 'Selected',
			source: override,
		})
})

it('rejects equal winning precedence and does not choose by insertion order', /** Ambiguous approved overrides and published roster entries are explicit unavailable states. */ () => {
	for (const source of [roster, override])
		expect(
			selectDatedWorkSource('employment', '2026-10-05', [source, { ...source, id: 'another' }]),
		).toEqual({ state: 'Unavailable', reason: 'EqualPrecedenceConflict' })
})

it('ignores drafts, unpublished rosters and other employment dates', /** Inactive or unrelated facts cannot hide the legitimate ordinary-schedule fallback. */ () => {
	expect(
		selectDatedWorkSource('employment', '2026-10-05', [
			{ ...override, state: 'Draft' },
			{ ...roster, rosterState: 'PendingApproval' },
			{ ...override, employmentId: 'other-employment' },
			{ ...roster, workDate: '2026-10-06' },
		]),
	).toEqual({ state: 'AssignedSchedule' })
	expect(
		selectDatedWorkSource('employment', '2026-10-05', [
			{ ...override, state: 'Superseded' },
			roster,
		]),
	).toEqual({ state: 'Selected', source: roster })
})
