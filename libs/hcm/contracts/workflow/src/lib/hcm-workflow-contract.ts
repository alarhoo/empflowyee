import {
	boolValue,
	dateValue,
	enumValue,
	idValue,
	intValue,
	invalidField,
	readBody,
	revisionValue,
} from '@empflowyee/hcm-runtime-contract'

/** Fixed sources needed by the requested journeys. Registry membership never activates a UI or grants authority. */
export const WORKFLOW_SOURCE_REGISTRY = {
	Attendance: { Override: 'WORK_SCHEDULES', Roster: 'SHIFT_PLANNING' },
	Leave: {
		Leave: 'APPROVE_LEAVES',
		Cancellation: 'APPROVE_LEAVES',
		Adjustment: 'LEAVE_ADMINISTRATION',
	},
} as const
export type WorkflowSource = keyof typeof WORKFLOW_SOURCE_REGISTRY
/** Admitted source cases use their own required graph; no implicit published definition is synthesized. */
export const WORKFLOW_DEFINITION_MODE = 'DomainManifest' as const
export type WorkflowAction = 'Approve' | 'Reject'
export interface WorkflowRequiredSlot {
	id: string
	revision: number
	state: 'Pending' | 'Approved' | 'Rejected'
	stage: number
	ordinal: number
	independent: boolean
	distinctActors: boolean
	candidateRuleCode: string
}
export interface WorkflowSafeFacts {
	subjectType: string
	dateFrom: string
	dateTo: string
	legalEntityId: string
	orgUnitId?: string
	sourceState: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled' | 'Invalidated'
	units?: string
	qualifyingMilliseconds?: string
}
/** Source requirements contain no narrative, evidence references, arbitrary URL or task-derived authority. */
export interface DomainApprovalManifest {
	schemaVersion: 1
	registryVersion: 1
	source: WorkflowSource
	caseId: string
	caseRevision: number
	subjectId: string
	subjectRevision: number
	generation: number
	slots: WorkflowRequiredSlot[]
	completion: 'AllRequiredAnyReject'
	safeFacts: WorkflowSafeFacts
	allowedActions: ['Approve', 'Reject']
	registeredRouteCode: string
}

/** Parse registry-approved safe facts; exact numeric strings never become floating-point values. */
function safeFacts(value: unknown, source: WorkflowSource): WorkflowSafeFacts {
	const input = readBody(
		value,
		['subjectType', 'dateFrom', 'dateTo', 'legalEntityId', 'sourceState'],
		['orgUnitId', source === 'Leave' ? 'units' : 'qualifyingMilliseconds'],
	)
	const subjectType = enumValue(
		input['subjectType'],
		'safeFacts.subjectType',
		Object.keys(WORKFLOW_SOURCE_REGISTRY[source]),
	)
	const dateFrom = dateValue(input['dateFrom'], 'safeFacts.dateFrom'),
		dateTo = dateValue(input['dateTo'], 'safeFacts.dateTo')
	if (dateTo < dateFrom) invalidField('safeFacts.dateTo')
	const result: WorkflowSafeFacts = {
		subjectType,
		dateFrom,
		dateTo,
		legalEntityId: idValue(input['legalEntityId'], 'safeFacts.legalEntityId'),
		sourceState: enumValue(input['sourceState'], 'safeFacts.sourceState', [
			'Pending',
			'Approved',
			'Rejected',
			'Cancelled',
			'Invalidated',
		]),
	}
	if (input['orgUnitId'] !== undefined)
		result.orgUnitId = idValue(input['orgUnitId'], 'safeFacts.orgUnitId')
	if (input['units'] !== undefined) {
		if (
			typeof input['units'] !== 'string' ||
			!/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(input['units'])
		)
			invalidField('safeFacts.units')
		result.units = input['units']
	}
	if (input['qualifyingMilliseconds'] !== undefined) {
		if (
			typeof input['qualifyingMilliseconds'] !== 'string' ||
			!/^(?:0|[1-9]\d{0,18})$/.test(input['qualifyingMilliseconds']) ||
			BigInt(input['qualifyingMilliseconds']) > 9223372036854775807n
		)
			invalidField('safeFacts.qualifyingMilliseconds')
		result.qualifyingMilliseconds = input['qualifyingMilliseconds']
	}
	return result
}

/** Require a complete bounded source graph with no optional-slot or configurable-threshold escape. */
export function parseDomainApprovalManifest(value: unknown): DomainApprovalManifest {
	const input = readBody(value, [
		'schemaVersion',
		'registryVersion',
		'source',
		'caseId',
		'caseRevision',
		'subjectId',
		'subjectRevision',
		'generation',
		'slots',
		'completion',
		'safeFacts',
		'allowedActions',
		'registeredRouteCode',
	])
	if (input['schemaVersion'] !== 1) invalidField('schemaVersion')
	if (input['registryVersion'] !== 1) invalidField('registryVersion')
	if (input['completion'] !== 'AllRequiredAnyReject') invalidField('completion')
	const source = enumValue(input['source'], 'source', ['Attendance', 'Leave'])
	const facts = safeFacts(input['safeFacts'], source)
	const routes: Readonly<Record<string, string>> = WORKFLOW_SOURCE_REGISTRY[source]
	if (input['registeredRouteCode'] !== routes[facts.subjectType])
		invalidField('registeredRouteCode')
	if (
		!Array.isArray(input['allowedActions']) ||
		input['allowedActions'].length !== 2 ||
		!input['allowedActions'].includes('Approve') ||
		!input['allowedActions'].includes('Reject')
	)
		invalidField('allowedActions')
	if (!Array.isArray(input['slots']) || !input['slots'].length || input['slots'].length > 25)
		invalidField('slots')
	const slots = input['slots'].map(
		/** Preserve exact source revisions and selector references. */ (
			value,
			index,
		): WorkflowRequiredSlot => {
			const field = `slots.${index}`,
				slot = readBody(value, [
					'id',
					'revision',
					'state',
					'stage',
					'ordinal',
					'independent',
					'distinctActors',
					'candidateRuleCode',
				])
			const code = slot['candidateRuleCode']
			if (typeof code !== 'string' || !code.trim() || code.length > 120 || /\p{Cc}/u.test(code))
				invalidField(field + '.candidateRuleCode')
			return {
				id: idValue(slot['id'], field + '.id'),
				revision: revisionValue(slot['revision']),
				state: enumValue(slot['state'], field + '.state', ['Pending', 'Approved', 'Rejected']),
				stage: intValue(slot['stage'], field + '.stage', 1, 5),
				ordinal: intValue(slot['ordinal'], field + '.ordinal', 1, 5),
				independent: boolValue(slot['independent'], field + '.independent'),
				distinctActors: boolValue(slot['distinctActors'], field + '.distinctActors'),
				candidateRuleCode: code,
			}
		},
	)
	if (
		new Set(
			slots.map(/** Slot identity is unique throughout the source graph. */ (slot) => slot.id),
		).size !== slots.length
	)
		invalidField('slots', 'duplicate')
	const stages = [
		...new Set(slots.map(/** Find declared stages without filling gaps. */ (slot) => slot.stage)),
	].sort(/** Compare numeric ordinals. */ (a, b) => a - b)
	for (const [index, stage] of stages.entries()) {
		if (stage !== index + 1) invalidField('slots', 'noncontiguous-stages')
		const members = slots.filter(
			/** Apply the five-slot bound independently per stage. */ (slot) => slot.stage === stage,
		)
		const ordinals = members
			.map(/** Retain declared source ordering. */ (slot) => slot.ordinal)
			.sort(/** Compare numeric ordinals. */ (a, b) => a - b)
		if (
			members.length > 5 ||
			ordinals.some(
				/** Reject duplicate or skipped required slot ordinals. */ (ordinal, index) =>
					ordinal !== index + 1,
			)
		)
			invalidField('slots', 'invalid-stage-slots')
	}
	slots.sort(
		/** Canonical order follows explicit ordinals rather than transport array ordering. */ (a, b) =>
			a.stage - b.stage || a.ordinal - b.ordinal,
	)
	const pending = slots.filter(
		/** Count unresolved obligations. */ (slot) => slot.state === 'Pending',
	)
	const rejected = slots.some(
		/** Any required rejection terminates the source case. */ (slot) => slot.state === 'Rejected',
	)
	if (
		(facts.sourceState === 'Pending' && (!pending.length || rejected)) ||
		(facts.sourceState === 'Approved' && (pending.length > 0 || rejected)) ||
		(facts.sourceState === 'Rejected' && !rejected)
	)
		invalidField('safeFacts.sourceState', 'inconsistent-slots')
	for (const slot of slots) {
		if (
			slot.state !== 'Pending' &&
			slots.some(
				/** A later stage cannot decide before all earlier obligations approve. */ (earlier) =>
					earlier.stage < slot.stage && earlier.state !== 'Approved',
			)
		)
			invalidField('slots', 'out-of-order-decision')
		if (
			(facts.subjectType === 'Override' || facts.subjectType === 'Adjustment') &&
			!slot.independent
		)
			invalidField('slots', 'independent-decision-required')
	}
	return {
		schemaVersion: 1,
		registryVersion: 1,
		source,
		caseId: idValue(input['caseId'], 'caseId'),
		caseRevision: revisionValue(input['caseRevision']),
		subjectId: idValue(input['subjectId'], 'subjectId'),
		subjectRevision: revisionValue(input['subjectRevision']),
		generation: revisionValue(input['generation']),
		slots,
		completion: 'AllRequiredAnyReject',
		safeFacts: facts,
		allowedActions: ['Approve', 'Reject'],
		registeredRouteCode: input['registeredRouteCode'] as string,
	}
}
