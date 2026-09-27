import { createHash } from 'node:crypto'
import {
	CHANGE_POLICY,
	CHANGE_TYPE_RULES,
	CLEARABLE_TARGETS,
	EMPLOYMENT_TARGETS,
	parseCancelChange,
	parseChangeListQuery,
	parseChangeOptionKind,
	parseCreateChange,
	parseDecideChange,
	parseRevisionCommand,
	parseUpdateChange,
	type ChangeComparisonRowDto,
	type ChangeOptionPage,
	type ChangeTargets,
	type ChangeType,
	type EmploymentChangePage,
	type EmploymentChangeRequestDto,
	type EmploymentChangeSummaryDto,
	type TargetField,
	type WorkerChangeContextDto,
} from '@empflowyee/hcm-employee-contract'
import {
	HcmDomainError,
	idValue,
	invalidField,
	readListQuery,
} from '@empflowyee/hcm-runtime-contract'
import {
	commandHash,
	runIdempotent,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import {
	capacityDemand,
	changeEventType,
	executesOnApproval,
	requireApplicable,
	requireCancellable,
	requireDraft,
	requireEffectiveDateInRange,
	requireIndependentDecider,
	requireStatusTransition,
} from '@empflowyee/hcm-api-employee-domain'
import type {
	AssignmentFacts,
	ChangeContextAssignment,
	WorkerChangeContext,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import type { EmployeeUnitOfWork, EmployeeWork } from './employee-unit'
import type {
	ChangeRequestInput,
	ChangeRequestRow,
	ChangeStepInput,
} from './employment-change-repository'

const READ = 'changes.read'
const REQUEST = 'changes.request'
const APPROVE = 'changes.approve'
const ENGAGED = ['Pending', 'Active', 'OnNotice', 'Suspended']
const ASSIGNMENT_FIELDS: readonly TargetField[] = [
	'unitId',
	'departmentId',
	'designationId',
	'locationId',
	'positionId',
	'jobTitle',
	'workMode',
	'fullTimeEquivalent',
	'standardHoursPerWeek',
	'costCenterCode',
]

/** An execution that failed safely; the request records the code and no workforce fact changes. */
class ExecutionFailure extends Error {
	/** Keep the safe failure code. */
	constructor(readonly code: string) {
		super(code)
	}
}

/** The safe failure code of a refused execution step. */
function failureCode(error: HcmDomainError): string {
	const codes: Record<string, string> = {
		'revision-conflict': 'facts-changed',
		'invalid-request': 'invalid-target',
		'not-found': 'reference-missing',
		'record-incomplete': 'record-incomplete',
	}
	const code = codes[error.code] ?? error.code
	return /^[a-z][a-z0-9-]{1,59}$/.test(code) ? code : 'execution-refused'
}

/** A digest of a step input, so evidence never stores the facts themselves. */
function digest(value: unknown): string {
	return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/** Whether a target is present, including an explicit clear. */
function has(targets: object, field: string): boolean {
	return (targets as Record<string, unknown>)[field] !== undefined
}

/**
 * Employment Changes use cases (TDD#API): typed, effective-dated requests executed through
 * WorkforceFactsPort after one independent approval (DEC-HCM2-002). Each command reauthorizes,
 * checks its revision and records audit and its receipt in one transaction.
 */
export class EmploymentChanges {
	/** Compose the change use cases on the employee unit of work. */
	constructor(private readonly unit: EmployeeUnitOfWork) {}

	/** A page of requests in the chosen view. */
	list(context: AuthenticatedHcmContext, params: URLSearchParams): Promise<EmploymentChangePage> {
		const query = parseChangeListQuery(params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Page the requests. */ async (w) => {
				const approver = await w.holds(APPROVE)
				const page = await w.changeRequests.list(query, w.accountId, approver)
				return {
					items: page.items.map(
						/** Summary. */ (row) => ({ ...this.summary(w, row), currentSlot: row.currentSlot }),
					),
					nextCursor: page.nextCursor,
				}
			},
		)
	}

	/** One request with its comparison, approvals and execution steps. */
	read(context: AuthenticatedHcmContext, id: string): Promise<EmploymentChangeRequestDto> {
		idValue(id, 'id')
		return this.unit.execute(
			context,
			READ,
			false,
			/** Read the request. */ (w) => this.detail(w, id),
		)
	}

	/** A worker's current facts for a new request. */
	context(context: AuthenticatedHcmContext, workerId: string): Promise<WorkerChangeContextDto> {
		idValue(workerId, 'workerId')
		return this.unit.execute(
			context,
			REQUEST,
			false,
			/** Read the facts. */ async (w) => {
				const facts = await w.changes.context(workerId, w.today)
				if (!facts) throw new HcmDomainError('not-found')
				return this.contextDto(facts, w.today)
			},
		)
	}

	/** Options for the request wizard. */
	options(
		context: AuthenticatedHcmContext,
		kind: string,
		params: URLSearchParams,
	): Promise<ChangeOptionPage> {
		const optionKind = parseChangeOptionKind(kind)
		const query = readListQuery(params, ['name:asc'], ['asOf'])
		const page = { limit: query.limit, ...(query.cursor ? { cursor: query.cursor } : {}) }
		return this.unit.execute(
			context,
			REQUEST,
			false,
			/** Page one option kind. */ async (w) => {
				const asOf = query.filters['asOf'] ?? w.today
				if (optionKind === 'workers') return w.changeRequests.workers(query.q, page)
				if (optionKind === 'positions') return w.changeRequests.positions(query.q, asOf, page)
				if (optionKind === 'worker-types') {
					const types = await w.records.workerTypes()
					const q = query.q.toLowerCase()
					return {
						items: types
							.filter(/** Matching. */ (item) => !q || item.name.toLowerCase().includes(q))
							.map(/** Option. */ (item) => ({ id: item.id, code: '', name: item.name })),
						nextCursor: null,
					}
				}
				if (optionKind === 'managers') {
					const result = await w.records.records(
						{ q: query.q, sort: 'name', status: 'Active' },
						page,
						w.today,
					)
					return {
						items: result.items.map(
							/** Option. */ (row) => ({
								id: row.workerId,
								code: row.workerNumber,
								name: row.displayName,
							}),
						),
						nextCursor: result.nextCursor,
					}
				}
				const result = await w.structure.options(
					optionKind,
					{ q: query.q, sort: 'name:asc', activeOnly: true, ...page },
					asOf,
				)
				return {
					items: result.items.map(
						/** Option. */ (item) => ({ id: item.id, code: item.code, name: item.name }),
					),
					nextCursor: result.nextCursor,
				}
			},
		)
	}

	/** Create a draft request against the worker's current facts. */
	create(
		context: AuthenticatedHcmContext,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<EmploymentChangeRequestDto> {
		const command = parseCreateChange(body)
		return this.command(
			context,
			REQUEST,
			'create',
			command,
			key,
			/** Validate the subject and targets, then store the draft. */ async (w) => {
				const facts = await w.changes.context(command.workerId, w.today)
				if (!facts) invalidField('workerId', 'unknown')
				const subject = this.subject(facts, command)
				const stored = await this.storedTargets(
					w,
					command.changeType,
					command.targets,
					command.effectiveDate,
					command.workerId,
				)
				const id = await w.changeRequests.insert({
					workerId: command.workerId,
					employmentId: command.employmentId,
					assignmentId: subject.assignment?.assignmentId ?? null,
					changeType: command.changeType,
					effectiveDate: command.effectiveDate,
					expectedEmploymentRevision: subject.employment?.revision ?? null,
					expectedAssignmentRevision: subject.assignment?.revision ?? null,
					...stored,
					reasonCode: command.reasonCode,
					reasonDetail: command.reasonDetail,
					evidenceReference: command.evidenceReference,
					idempotencyKey: key,
				})
				await this.audit(
					w,
					'employee.change-requested',
					id,
					requestId,
					null,
					'Draft',
					command.reasonDetail,
					Object.keys(command.targets),
				)
				return this.detail(w, id)
			},
		)
	}

	/** Replace a draft's facts; the requester's own drafts only. */
	update(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<EmploymentChangeRequestDto> {
		idValue(id, 'id')
		return this.command(
			context,
			REQUEST,
			'update',
			{ id, body },
			key,
			/** Edit the draft. */ async (w) => {
				const row = await this.own(w, id)
				const command = parseUpdateChange(row.changeType, body)
				this.revision(row, command.expectedRevision)
				requireDraft(row.status)
				const facts = await w.changes.context(row.workerId, w.today)
				if (!facts) throw new HcmDomainError('not-found')
				const subject = this.subject(facts, row)
				const stored = await this.storedTargets(
					w,
					row.changeType,
					command.targets,
					command.effectiveDate,
					row.workerId,
				)
				await w.changeRequests.update(id, {
					effectiveDate: command.effectiveDate,
					expectedEmploymentRevision: subject.employment?.revision ?? null,
					expectedAssignmentRevision: subject.assignment?.revision ?? null,
					...stored,
					reasonCode: command.reasonCode,
					reasonDetail: command.reasonDetail,
					evidenceReference: row.evidenceReference,
				})
				await this.audit(
					w,
					'employee.change-updated',
					id,
					requestId,
					'Draft',
					'Draft',
					command.reasonDetail,
					Object.keys(command.targets),
				)
				return this.detail(w, id)
			},
		)
	}

	/** Submit a draft: snapshot the approval policy and open its slot. */
	submit(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<EmploymentChangeRequestDto> {
		idValue(id, 'id')
		const command = parseRevisionCommand(body)
		return this.command(
			context,
			REQUEST,
			'submit',
			{ id, ...command },
			key,
			/** Submit the draft. */ async (w) => {
				const row = await this.own(w, id)
				this.revision(row, command.expectedRevision)
				requireDraft(row.status)
				requireEffectiveDateInRange(row.changeType, row.effectiveDate, w.today)
				await w.changeRequests.transition(id, {
					status: 'PendingApproval',
					approvalPolicy: { code: CHANGE_POLICY.code, version: CHANGE_POLICY.version },
					submitted: true,
				})
				await this.audit(
					w,
					'employee.change-submitted',
					id,
					requestId,
					'Draft',
					'PendingApproval',
					null,
					[],
				)
				return this.detail(w, id)
			},
		)
	}

	/** Decide the approval slot; a final approval executes at once when allowed. */
	async decide(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<EmploymentChangeRequestDto> {
		idValue(id, 'id')
		const command = parseDecideChange(body)
		const payload = { id, ...command }
		try {
			return await this.command(
				context,
				APPROVE,
				'decide',
				payload,
				key,
				/** Decide the slot. */ async (w) => {
					const row = await this.lock(w, id)
					this.revision(row, command.expectedRevision)
					if (row.status !== 'PendingApproval') throw new HcmDomainError('invalid-state')
					requireIndependentDecider(row.requestedByAccountId, w.accountId)
					if (command.slotCode !== CHANGE_POLICY.slot) invalidField('slotCode', 'unknown')
					if (command.decision === 'Approved')
						requireEffectiveDateInRange(row.changeType, row.effectiveDate, w.today)
					await w.changeRequests.insertApproval(id, {
						slotCode: command.slotCode,
						decision: command.decision,
						authorityCode: 'hcm.employee.' + APPROVE,
						reason: command.reason,
					})
					if (command.decision === 'Rejected') {
						await w.changeRequests.transition(id, { status: 'Rejected' })
						await this.audit(
							w,
							'employee.change-rejected',
							id,
							requestId,
							'PendingApproval',
							'Rejected',
							command.reason,
							[],
						)
						return this.detail(w, id)
					}
					await w.changeRequests.transition(id, { status: 'Approved', approved: true })
					await this.audit(
						w,
						'employee.change-approved',
						id,
						requestId,
						'PendingApproval',
						'Approved',
						command.reason,
						[],
					)
					if (executesOnApproval(row.changeType, this.targetsOf(row), row.effectiveDate, w.today))
						await this.execute(w, row, requestId)
					return this.detail(w, id)
				},
			)
		} catch (error) {
			if (!(error instanceof ExecutionFailure)) throw error
			return this.recordFailure(
				context,
				APPROVE,
				'decide',
				payload,
				key,
				requestId,
				id,
				error.code,
				command,
			)
		}
	}

	/** Apply an approved request on or after its date, or retry a failed one. */
	async apply(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<EmploymentChangeRequestDto> {
		idValue(id, 'id')
		const command = parseRevisionCommand(body)
		const payload = { id, ...command }
		try {
			return await this.command(
				context,
				REQUEST,
				'apply',
				payload,
				key,
				/** Execute the request. */ async (w) => {
					const row = await this.lock(w, id)
					this.revision(row, command.expectedRevision)
					requireApplicable(row.status, row.effectiveDate, w.today)
					await this.execute(w, row, requestId)
					return this.detail(w, id)
				},
			)
		} catch (error) {
			if (!(error instanceof ExecutionFailure)) throw error
			return this.recordFailure(
				context,
				REQUEST,
				'apply',
				payload,
				key,
				requestId,
				id,
				error.code,
				null,
			)
		}
	}

	/** Cancel the requester's own request before it executes. */
	cancel(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<EmploymentChangeRequestDto> {
		idValue(id, 'id')
		const command = parseCancelChange(body)
		return this.command(
			context,
			REQUEST,
			'cancel',
			{ id, ...command },
			key,
			/** Cancel the request. */ async (w) => {
				const row = await this.own(w, id)
				this.revision(row, command.expectedRevision)
				requireCancellable(row.status)
				// A failed execution stays recorded in its steps; the request no longer carries the code.
				await w.changeRequests.transition(id, {
					status: 'Cancelled',
					cancelReason: command.reason,
					failureCode: null,
				})
				await this.audit(
					w,
					'employee.change-cancelled',
					id,
					requestId,
					row.status,
					'Cancelled',
					command.reason,
					[],
				)
				return this.detail(w, id)
			},
		)
	}

	/** Run one idempotent command in a business transaction. */
	private command<T>(
		context: AuthenticatedHcmContext,
		permission: string,
		operation: string,
		payload: unknown,
		key: string,
		work: (w: EmployeeWork) => Promise<T>,
	): Promise<T> {
		const hash = commandHash(operation, payload)
		return this.unit.execute(
			context,
			permission,
			true,
			/** Keep receipts in the business transaction. */ (w) =>
				runIdempotent(
					w.receipts,
					`changes.${operation}`,
					key,
					hash,
					/** Run once. */ () => work(w),
				),
		)
	}

	/**
	 * Record a failed execution in a new transaction: the decision (if any) stands, the request is
	 * Failed with a safe code, and no workforce fact changed because the execution rolled back.
	 */
	private recordFailure(
		context: AuthenticatedHcmContext,
		permission: string,
		operation: string,
		payload: unknown,
		key: string,
		requestId: string,
		id: string,
		code: string,
		decision: { slotCode: string; reason: string } | null,
	): Promise<EmploymentChangeRequestDto> {
		return this.command(
			context,
			permission,
			operation,
			payload,
			key,
			/** Record the failure. */ async (w) => {
				const row = await this.lock(w, id)
				if (decision) {
					requireIndependentDecider(row.requestedByAccountId, w.accountId)
					await w.changeRequests.insertApproval(id, {
						slotCode: decision.slotCode,
						decision: 'Approved',
						authorityCode: 'hcm.employee.' + APPROVE,
						reason: decision.reason,
					})
					await this.audit(
						w,
						'employee.change-approved',
						id,
						requestId,
						row.status,
						'Approved',
						decision.reason,
						[],
					)
				}
				await w.changeRequests.insertSteps(id, [
					{
						stepCode: 'execute',
						status: 'Failed',
						inputHash: digest({ id, code }),
						resultEntityType: null,
						resultEntityId: null,
						failureCode: code,
					},
				])
				await w.changeRequests.transition(id, {
					status: 'Failed',
					failureCode: code,
					...(decision ? { approved: true } : {}),
				})
				await this.audit(w, 'employee.change-failed', id, requestId, 'Approved', 'Failed', null, [])
				return this.detail(w, id)
			},
		)
	}

	/** Execute every step in the caller's transaction; any failure rolls all of them back. */
	private async execute(w: EmployeeWork, row: ChangeRequestRow, requestId: string): Promise<void> {
		const steps: ChangeStepInput[] = []
		/** Run one step and record its result entity. */
		const step = async (
			code: string,
			type: ChangeStepInput['resultEntityType'],
			input: unknown,
			run: () => Promise<{ id: string } | null>,
		) => {
			const result = await run()
			steps.push({
				stepCode: code,
				status: result ? 'Succeeded' : 'Skipped',
				inputHash: digest(input),
				resultEntityType: result ? type : null,
				resultEntityId: result?.id ?? null,
				failureCode: null,
			})
			return result
		}
		try {
			const result =
				row.changeType === 'Rehire'
					? await this.rehire(w, row, step)
					: await this.change(w, row, step)
			await w.changeRequests.insertSteps(row.id, steps)
			await w.changeRequests.transition(row.id, {
				status: 'Completed',
				completed: true,
				failureCode: null,
				...result,
			})
			await this.audit(
				w,
				'employee.change-executed',
				row.id,
				requestId,
				row.status,
				'Completed',
				null,
				Object.keys(row.targets),
			)
		} catch (error) {
			if (error instanceof HcmDomainError) throw new ExecutionFailure(failureCode(error))
			throw error
		}
	}

	/** Start a new employment for a worker with no engaged employment. */
	private async rehire(
		w: EmployeeWork,
		row: ChangeRequestRow,
		step: StepRunner,
	): Promise<{ resultEmploymentId: string; resultAssignmentId: string }> {
		const facts = await w.changes.context(row.workerId, w.today)
		if (!facts) throw new HcmDomainError('not-found')
		if (
			facts.employments.some(
				/** Engaged. */ (item) => ENGAGED.includes(item.employmentStatus ?? ''),
			)
		)
			throw new HcmDomainError('invalid-state', [{ field: 'workerId', code: 'engaged' }])
		const t = row.targets
		if (t.workerTypeId) {
			const typeId = t.workerTypeId
			await step(
				'set-worker-type',
				null,
				typeId,
				/** Worker type. */ async () => {
					await w.facts.setWorkerType(row.workerId, typeId)
					return null
				},
			)
		}
		const employment = (await step(
			'create-employment',
			'employment',
			t,
			/** Employment. */ () =>
				w.facts.createEmployment({
					workerId: row.workerId,
					legalEntityId: t.legalEntityId ?? '',
					employmentType: t.employmentType ?? 'Permanent',
					employmentStatus: row.effectiveDate > w.today ? 'Pending' : 'Active',
					hireDate: row.effectiveDate,
					isPrimary: true,
					workEmail: null,
					continuousServiceStartDate: null,
					probationEndDate: t.probationEndDate ?? null,
					probationStatus: t.probationEndDate ? 'InProgress' : 'NotApplicable',
					noticePeriodDays: t.noticePeriodDays ?? null,
				}),
		)) as { id: string }
		const assignmentFacts = this.assignmentFacts(null, row)
		await this.requireCapacity(w, null, assignmentFacts, row.effectiveDate)
		const assignment = (await step(
			'open-assignment',
			'assignment',
			assignmentFacts,
			/** Assignment. */ () => w.facts.openAssignment(employment.id, assignmentFacts),
		)) as { id: string }
		if (t.managerAssignmentId) {
			const manager = await this.managerAssignment(w, t.managerAssignmentId, row)
			await step(
				'set-manager',
				'reporting_line',
				manager,
				/** Line. */ () =>
					w.facts.setReportingLine({
						assignmentId: assignment.id,
						managerAssignmentId: manager,
						type: 'Solid',
						isPrimary: true,
						effectiveFrom: row.effectiveDate,
						reason: row.reasonCode,
					}),
			)
		}
		await this.event(w, row, employment.id, assignment.id, step)
		return { resultEmploymentId: employment.id, resultAssignmentId: assignment.id }
	}

	/** Change an existing employment and its assignment. */
	private async change(
		w: EmployeeWork,
		row: ChangeRequestRow,
		step: StepRunner,
	): Promise<{ resultAssignmentId?: string }> {
		const employmentId = row.employmentId as string
		const locked = await w.changes.lockEmployment(employmentId)
		if (!locked) throw new HcmDomainError('not-found')
		if (
			row.expectedEmploymentRevision !== null &&
			locked.revision !== row.expectedEmploymentRevision
		)
			throw new HcmDomainError('revision-conflict')
		const facts = await w.changes.context(row.workerId, w.today)
		const employment = facts?.employments.find(
			/** This one. */ (item) => item.employmentId === employmentId,
		)
		if (!facts || !employment) throw new HcmDomainError('not-found')
		requireStatusTransition(row.changeType, employment.employmentStatus)
		const t = row.targets
		const assignmentChange = ASSIGNMENT_FIELDS.some(/** Present. */ (field) => has(t, field))
		const managerChange = has(t, 'managerAssignmentId')
		let resultAssignmentId: string | undefined
		let eventAssignment: string | null = row.assignmentId
		if (assignmentChange || managerChange) {
			if (!row.assignmentId)
				throw new HcmDomainError('invalid-state', [{ field: 'assignmentId', code: 'required' }])
			const lock = await w.changes.lockAssignment(row.assignmentId)
			if (!lock || !lock.open) throw new HcmDomainError('revision-conflict')
			if (
				row.expectedAssignmentRevision !== null &&
				lock.revision !== row.expectedAssignmentRevision
			)
				throw new HcmDomainError('revision-conflict')
			const current = facts.assignments.find(
				/** This one. */ (item) => item.assignmentId === row.assignmentId,
			)
			if (!current) throw new HcmDomainError('revision-conflict')
			let manager: string | null | undefined
			if (managerChange)
				manager = t.managerAssignmentId
					? await this.managerAssignment(w, t.managerAssignmentId, row)
					: null
			if (assignmentChange) {
				const next = this.assignmentFacts(current, row)
				await this.requireCapacity(w, current, next, row.effectiveDate)
				if (lock.established) {
					const moved = (await step(
						'supersede-assignment',
						'assignment',
						next,
						/** Supersede. */ async () =>
							(
								await w.facts.supersedeAssignment(
									row.assignmentId as string,
									lock.revision,
									next,
									managerChange
										? { primaryManager: { assignmentId: manager ?? null, reason: row.reasonCode } }
										: undefined,
								)
							).opened,
					)) as { id: string }
					resultAssignmentId = moved.id
				} else {
					if (row.changeType !== 'Correction') throw new HcmDomainError('record-incomplete')
					const established = (await step(
						'establish-assignment',
						'assignment',
						next,
						/** Establish. */ async () =>
							(await w.facts.establishAssignment(row.assignmentId as string, lock.revision, next))
								.opened,
					)) as { id: string }
					resultAssignmentId = established.id
					if (manager) await this.setManager(w, established.id, manager, row, step)
				}
				eventAssignment = resultAssignmentId
			} else if (manager === null) {
				await step(
					'end-manager',
					'reporting_line',
					null,
					/** End line. */ () =>
						w.facts.endPrimaryReportingLine(row.assignmentId as string, row.effectiveDate),
				)
			} else if (manager) {
				await this.setManager(w, row.assignmentId, manager, row, step)
			}
		}
		const status = CHANGE_TYPE_RULES[row.changeType].status
		const employmentChange = EMPLOYMENT_TARGETS.some(/** Present. */ (field) => has(t, field))
		if (status || employmentChange) {
			const change = {
				expectedRevision: locked.revision,
				...(status ? { employmentStatus: status } : {}),
				...(t.employmentType !== undefined ? { employmentType: t.employmentType } : {}),
				...(t.continuousServiceStartDate !== undefined
					? { continuousServiceStartDate: t.continuousServiceStartDate }
					: {}),
				...(t.probationEndDate !== undefined ? { probationEndDate: t.probationEndDate } : {}),
				...(t.noticePeriodDays !== undefined ? { noticePeriodDays: t.noticePeriodDays } : {}),
			}
			await step(
				'apply-employment-facts',
				'employment',
				change,
				/** Employment facts. */ () => w.facts.applyEmploymentFacts(employmentId, change),
			)
		}
		await this.event(w, row, employmentId, eventAssignment, step)
		return resultAssignmentId ? { resultAssignmentId } : {}
	}

	/** Start a primary solid manager line from the effective date. */
	private async setManager(
		w: EmployeeWork,
		assignmentId: string,
		manager: string,
		row: ChangeRequestRow,
		step: StepRunner,
	): Promise<void> {
		await step(
			'set-manager',
			'reporting_line',
			manager,
			/** Line. */ () =>
				w.facts.setReportingLine({
					assignmentId,
					managerAssignmentId: manager,
					type: 'Solid',
					isPrimary: true,
					effectiveFrom: row.effectiveDate,
					reason: row.reasonCode,
				}),
		)
	}

	/** Record the change's worker event for the employment. */
	private async event(
		w: EmployeeWork,
		row: ChangeRequestRow,
		employmentId: string,
		assignmentId: string | null,
		step: StepRunner,
	): Promise<void> {
		const approval = (await w.changeRequests.approvals(row.id)).find(
			/** The approving decision. */ (item) => item.decision === 'Approved',
		)
		const fields = Object.keys(row.targets).map(
			/** Readable. */ (field) => field.replace(/Id$/, ''),
		)
		await step(
			'record-event',
			'worker_event',
			row.changeType,
			/** Event. */ () =>
				w.facts.recordWorkerEvent({
					workerId: row.workerId,
					employmentId,
					assignmentId,
					eventTypeCode: changeEventType(row.changeType),
					effectiveDate: row.effectiveDate,
					reason: `${row.reasonCode}: ${row.reasonDetail}`.slice(0, 500),
					previousValueSummary: '',
					newValueSummary: fields.join(', ').slice(0, 200),
					approvedByAccountId: approval?.decidedByAccountId ?? null,
					approvedOn: approval ? approval.decidedAt.slice(0, 10) : null,
				}),
		)
	}

	/** Refuse a position change beyond headcount or FTE capacity (DEC-HCM2-007). */
	private async requireCapacity(
		w: EmployeeWork,
		current: ChangeContextAssignment | null,
		next: AssignmentFacts,
		date: string,
	): Promise<void> {
		const demand = capacityDemand(
			{ positionId: current?.position?.id ?? null, fte: current?.fullTimeEquivalent ?? null },
			{ positionId: next.positionId ?? null, fte: next.fullTimeEquivalent },
		)
		if (!demand) return
		const decision = await w.positions.capacityDecision(
			demand.positionId,
			date,
			demand.headcount,
			demand.fte,
		)
		if (decision === 'not-open')
			throw new HcmDomainError('invalid-state', [{ field: 'targets.positionId', code: 'not-open' }])
		if (decision !== 'allowed') throw new HcmDomainError(decision)
	}

	/** The manager's primary assignment on the effective date, never the worker's own. */
	private async managerAssignment(
		w: EmployeeWork,
		storedAssignmentId: string,
		row: ChangeRequestRow,
	): Promise<string> {
		const manager = await w.changeRequests.managerOf(storedAssignmentId)
		if (!manager || manager.workerId === row.workerId)
			invalidField('targets.managerWorkerId', 'unknown')
		const assignment = await w.changes.primaryAssignment(manager.workerId, row.effectiveDate)
		if (!assignment) invalidField('targets.managerWorkerId', 'no-assignment')
		return assignment
	}

	/** New assignment facts: the current facts with the request's targets applied. */
	private assignmentFacts(
		current: ChangeContextAssignment | null,
		row: ChangeRequestRow,
	): AssignmentFacts {
		const t = row.targets
		/** A target, or the current value when the request keeps it. */
		const pick = <T>(field: keyof typeof t, fallback: T): T =>
			t[field] === undefined ? fallback : (t[field] as T)
		return {
			organisationId: pick('unitId', current?.unit?.id ?? ''),
			locationId: pick('locationId', current?.location?.id ?? ''),
			departmentId: pick('departmentId', current?.department?.id ?? null),
			designationId: pick('designationId', current?.designation?.id ?? null),
			positionId: pick('positionId', current?.position?.id ?? null),
			jobTitle: pick('jobTitle', current?.jobTitle ?? ''),
			workMode: pick('workMode', current?.workMode ?? 'OnSite'),
			fullTimeEquivalent: pick('fullTimeEquivalent', current?.fullTimeEquivalent ?? 1),
			standardHoursPerWeek: pick('standardHoursPerWeek', current?.standardHoursPerWeek ?? null),
			costCenterCode: pick<string | null>('costCenterCode', current?.costCenterCode ?? '') ?? '',
			isPrimary: current ? current.primary : true,
			isBillable: current?.billable ?? false,
			effectiveFrom: row.effectiveDate,
			changeNote: `${row.changeType}: ${row.reasonCode}`,
		}
	}

	/** The employment and assignment a request acts on, checked against the worker's facts. */
	private subject(
		facts: WorkerChangeContext,
		command: { changeType: ChangeType; employmentId: string | null; assignmentId: string | null },
	) {
		if (command.changeType === 'Rehire') {
			if (
				facts.employments.some(
					/** Engaged. */ (item) => ENGAGED.includes(item.employmentStatus ?? ''),
				)
			)
				invalidField('workerId', 'engaged')
			return { employment: null, assignment: null }
		}
		const employment = facts.employments.find(
			/** Named. */ (item) => item.employmentId === command.employmentId,
		)
		if (!employment) invalidField('employmentId', 'unknown')
		const candidates = facts.assignments.filter(
			/** Of the employment. */ (item) => item.employmentId === employment.employmentId,
		)
		const assignment = command.assignmentId
			? candidates.find(/** Named. */ (item) => item.assignmentId === command.assignmentId)
			: (candidates.find(/** Primary. */ (item) => item.primary) ?? candidates[0])
		if (command.assignmentId && !assignment) invalidField('assignmentId', 'unknown')
		return { employment, assignment: assignment ?? null }
	}

	/** Validate target references on the date and store the manager as an assignment. */
	private async storedTargets(
		w: EmployeeWork,
		type: ChangeType,
		targets: ChangeTargets,
		date: string,
		workerId: string,
	): Promise<Pick<ChangeRequestInput, 'targets' | 'cleared'>> {
		const refs: [
			TargetField,
			'legal-entities' | 'units' | 'departments' | 'designations' | 'locations',
		][] = [
			['legalEntityId', 'legal-entities'],
			['unitId', 'units'],
			['departmentId', 'departments'],
			['designationId', 'designations'],
			['locationId', 'locations'],
		]
		for (const [field, kind] of refs) {
			const value = targets[field]
			if (typeof value === 'string')
				await w.structure.requireReference(kind, value, `targets.${field}`, date)
		}
		if (targets.positionId) {
			const placement = await w.positions.placement(targets.positionId, date)
			if (!placement || placement.lifecycleStatus !== 'Open')
				invalidField('targets.positionId', 'not-open')
		}
		if (targets.workerTypeId) {
			const types = await w.records.workerTypes()
			if (!types.some(/** Known. */ (item) => item.id === targets.workerTypeId))
				invalidField('targets.workerTypeId', 'unknown')
		}
		const { managerWorkerId, ...rest } = targets
		const stored: ChangeRequestInput['targets'] = { ...rest }
		if (managerWorkerId !== undefined) {
			if (managerWorkerId === null) stored.managerAssignmentId = null
			else {
				if (managerWorkerId === workerId) invalidField('targets.managerWorkerId', 'self')
				const assignment = await w.changes.primaryAssignment(managerWorkerId, date)
				if (!assignment) invalidField('targets.managerWorkerId', 'no-assignment')
				stored.managerAssignmentId = assignment
			}
		}
		void type
		const cleared = CLEARABLE_TARGETS.filter(
			/** Explicit clears. */ (field) => (targets as Record<string, unknown>)[field] === null,
		)
		return { targets: stored, cleared }
	}

	/** Lock a request, hidden when unknown. */
	private async lock(w: EmployeeWork, id: string): Promise<ChangeRequestRow> {
		const row = await w.changeRequests.get(id, true)
		if (!row) throw new HcmDomainError('not-found')
		return row
	}

	/** Lock the actor's own request; another requester's request is not theirs to change. */
	private async own(w: EmployeeWork, id: string): Promise<ChangeRequestRow> {
		const row = await this.lock(w, id)
		if (row.requestedByAccountId !== w.accountId) throw new HcmDomainError('forbidden')
		return row
	}

	/** Require the quoted revision. */
	private revision(row: ChangeRequestRow, expected: number): void {
		if (row.revision !== expected) throw new HcmDomainError('revision-conflict')
	}

	/** The request targets in contract form, with the manager as a marker. */
	private targetsOf(row: ChangeRequestRow): ChangeTargets {
		const { managerAssignmentId, ...rest } = row.targets
		return managerAssignmentId === undefined
			? rest
			: { ...rest, managerWorkerId: managerAssignmentId }
	}

	/** Append one business audit event naming fields only. */
	private audit(
		w: EmployeeWork,
		action: string,
		id: string,
		requestId: string,
		fromState: string | null,
		toState: string,
		reason: string | null,
		fields: string[],
	): Promise<void> {
		const event = w.audit.append({
			action,
			category: 'business',
			targetType: 'employment-change',
			targetId: id,
			requestId,
			summary: {
				reason,
				changedFields: fields.filter(
					/** Audit-safe names. */ (field) => /^[a-zA-Z][A-Za-z0-9]{0,63}$/.test(field),
				),
				fromState,
				toState,
			},
		})
		return event.then(/** The event id is not needed. */ () => undefined)
	}

	/** Summary fields of a row. */
	private summary(w: EmployeeWork, row: ChangeRequestRow): EmploymentChangeSummaryDto {
		return {
			id: row.id,
			workerId: row.workerId,
			workerName: row.workerName,
			workerNumber: row.workerNumber,
			changeType: row.changeType,
			effectiveDate: row.effectiveDate,
			status: row.status,
			currentSlot: row.status === 'PendingApproval' ? CHANGE_POLICY.slot : null,
			requestedBy: row.requestedBy,
			requestedByMe: row.requestedByAccountId === w.accountId,
			requestedAt: row.requestedAt,
		}
	}

	/** The full request for display. */
	private async detail(w: EmployeeWork, id: string): Promise<EmploymentChangeRequestDto> {
		const row = await w.changeRequests.get(id)
		if (!row) throw new HcmDomainError('not-found')
		const [approvals, steps, facts, requester, approver] = await Promise.all([
			w.changeRequests.approvals(id),
			w.changeRequests.steps(id),
			w.changes.context(row.workerId, w.today),
			w.holds(REQUEST),
			w.holds(APPROVE),
		])
		const mine = row.requestedByAccountId === w.accountId
		const manager = row.targets.managerAssignmentId
			? await w.changeRequests.managerOf(row.targets.managerAssignmentId)
			: undefined
		const { managerAssignmentId, ...rest } = row.targets
		const targets: ChangeTargets = { ...rest }
		if (managerAssignmentId !== undefined) targets.managerWorkerId = manager?.workerId ?? null
		const decided = approvals.find(
			/** The slot's decision. */ (item) => item.slotCode === CHANGE_POLICY.slot,
		)
		return {
			...this.summary(w, row),
			employmentId: row.employmentId,
			assignmentId: row.assignmentId,
			targets,
			comparison: await this.comparison(w, row, facts, manager?.name ?? null),
			reasonCode: row.reasonCode,
			reasonDetail: row.reasonDetail,
			evidenceReference: row.evidenceReference,
			approvalPolicy:
				row.approvalPolicyCode && row.approvalPolicyVersion
					? { code: row.approvalPolicyCode, version: row.approvalPolicyVersion }
					: null,
			slots: this.slots(row, decided?.decision),
			approvals: approvals.map(
				/** Decision. */ (item) => ({
					slotCode: item.slotCode,
					decision: item.decision,
					decidedBy: item.decidedBy,
					decidedByMe: item.decidedByAccountId === w.accountId,
					reason: item.reason,
					decidedAt: item.decidedAt,
				}),
			),
			execution: steps,
			submittedAt: row.submittedAt,
			approvedAt: row.approvedAt,
			completedAt: row.completedAt,
			cancelledAt: row.cancelledAt,
			cancelReason: row.cancelReason,
			failureCode: row.failureCode,
			resultEmploymentId: row.resultEmploymentId,
			actions: {
				edit: requester && mine && row.status === 'Draft',
				submit: requester && mine && row.status === 'Draft',
				decide: approver && !mine && row.status === 'PendingApproval',
				apply:
					requester &&
					(row.status === 'Failed' || row.status === 'Approved') &&
					row.effectiveDate <= w.today,
				cancel:
					requester &&
					mine &&
					['Draft', 'PendingApproval', 'Approved', 'Failed'].includes(row.status),
			},
			revision: row.revision,
		}
	}

	/** The approval slots of a submitted request. */
	private slots(
		row: ChangeRequestRow,
		decision: 'Approved' | 'Rejected' | undefined,
	): EmploymentChangeRequestDto['slots'] {
		if (!row.approvalPolicyCode) return []
		return [{ code: CHANGE_POLICY.slot, name: 'HR approver', status: decision ?? 'Pending' }]
	}

	/** Current against proposed facts as display text. */
	private async comparison(
		w: EmployeeWork,
		row: ChangeRequestRow,
		facts: WorkerChangeContext | undefined,
		managerName: string | null,
	): Promise<ChangeComparisonRowDto[]> {
		const employment = facts?.employments.find(
			/** This one. */ (item) => item.employmentId === row.employmentId,
		)
		const assignment = facts?.assignments.find(
			/** This one. */ (item) => item.assignmentId === row.assignmentId,
		)
		const t = row.targets
		const date = row.effectiveDate
		/** A label for one structure kind. */
		const label = async (
			kind: 'legal-entities' | 'units' | 'departments' | 'designations' | 'locations',
			id: string | null | undefined,
		) => (id ? ((await w.structure.labels(kind, [id], date)).get(id)?.name ?? id) : null)
		const names = await w.changeRequests.names([
			...(t.positionId ? [{ table: 'position', id: t.positionId }] : []),
			...(t.workerTypeId ? [{ table: 'worker_type', id: t.workerTypeId }] : []),
		])
		/** A display number. */
		const num = (value: number | null | undefined) =>
			value === null || value === undefined ? null : String(value)
		const rows: [TargetField, string | null, /** Proposed text. */ () => Promise<string | null>][] =
			[
				[
					'legalEntityId',
					employment?.legalEntity?.name ?? null,
					/** Proposed text. */ () => label('legal-entities', t.legalEntityId),
				],
				[
					'workerTypeId',
					facts?.workerType?.name ?? null,
					/** Proposed text. */ async () =>
						t.workerTypeId ? (names.get(t.workerTypeId) ?? null) : null,
				],
				[
					'employmentType',
					employment?.employmentType ?? null,
					/** Proposed text. */ async () => t.employmentType ?? null,
				],
				[
					'continuousServiceStartDate',
					employment?.continuousServiceStartDate ?? null,
					/** Proposed text. */ async () => t.continuousServiceStartDate ?? null,
				],
				[
					'probationEndDate',
					employment?.probationEndDate ?? null,
					/** Proposed text. */ async () => t.probationEndDate ?? null,
				],
				[
					'noticePeriodDays',
					num(employment?.noticePeriodDays),
					/** Proposed text. */ async () => num(t.noticePeriodDays),
				],
				[
					'unitId',
					assignment?.unit?.name ?? null,
					/** Proposed text. */ () => label('units', t.unitId),
				],
				[
					'departmentId',
					assignment?.department?.name ?? null,
					/** Proposed text. */ () => label('departments', t.departmentId),
				],
				[
					'designationId',
					assignment?.designation?.name ?? null,
					/** Proposed text. */ () => label('designations', t.designationId),
				],
				[
					'locationId',
					assignment?.location?.name ?? null,
					/** Proposed text. */ () => label('locations', t.locationId),
				],
				[
					'positionId',
					assignment?.position?.name ?? null,
					/** Proposed text. */ async () =>
						t.positionId ? (names.get(t.positionId) ?? null) : null,
				],
				[
					'jobTitle',
					assignment?.jobTitle ?? null,
					/** Proposed text. */ async () => t.jobTitle ?? null,
				],
				[
					'workMode',
					assignment?.workMode ?? null,
					/** Proposed text. */ async () => t.workMode ?? null,
				],
				[
					'fullTimeEquivalent',
					num(assignment?.fullTimeEquivalent),
					/** Proposed text. */ async () => num(t.fullTimeEquivalent),
				],
				[
					'standardHoursPerWeek',
					num(assignment?.standardHoursPerWeek),
					/** Proposed text. */ async () => num(t.standardHoursPerWeek),
				],
				[
					'costCenterCode',
					assignment?.costCenterCode || null,
					/** Proposed text. */ async () => t.costCenterCode || null,
				],
			]
		const result: ChangeComparisonRowDto[] = []
		for (const [field, current, proposed] of rows)
			if (has(t, field))
				result.push({
					field,
					current: row.changeType === 'Rehire' ? null : current,
					proposed: await proposed(),
				})
		if (has(t, 'managerAssignmentId'))
			result.push({
				field: 'managerWorkerId',
				current: assignment?.manager?.name ?? null,
				proposed: managerName,
			})
		const status = CHANGE_TYPE_RULES[row.changeType].status
		if (status)
			result.push({
				field: 'employmentStatus',
				current: employment?.employmentStatus ?? null,
				proposed: status,
			})
		return result
	}

	/** Context facts for the wizard. */
	private contextDto(facts: WorkerChangeContext, asOf: string): WorkerChangeContextDto {
		return {
			workerId: facts.workerId,
			displayName: facts.displayName,
			workerNumber: facts.workerNumber,
			workerType: facts.workerType,
			employments: facts.employments.map(
				/** Employment. */ (item) => ({
					employmentId: item.employmentId,
					revision: item.revision,
					primary: item.primary,
					legalEntity: item.legalEntity,
					employmentType: item.employmentType,
					employmentStatus: item.employmentStatus,
					hireDate: item.hireDate,
					endDate: item.endDate,
					continuousServiceStartDate: item.continuousServiceStartDate,
					probationEndDate: item.probationEndDate,
					noticePeriodDays: item.noticePeriodDays,
					eligibleForRehire: item.eligibleForRehire,
					established: item.established,
				}),
			),
			assignments: facts.assignments.map(
				/** Assignment. */ ({ billable, manager, ...item }) => {
					void billable
					return { ...item, manager: manager ? { id: manager.id, name: manager.name } : null }
				},
			),
			rehireAllowed: !facts.employments.some(
				/** Engaged. */ (item) => ENGAGED.includes(item.employmentStatus ?? ''),
			),
			asOf,
		}
	}
}

/** Runs one execution step and records its result. */
type StepRunner = (
	code: string,
	type: ChangeStepInput['resultEntityType'],
	input: unknown,
	run: () => Promise<{ id: string } | null>,
) => Promise<{ id: string } | null>
