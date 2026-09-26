import type { WorkforceReadPort } from '@empflowyee/hcm-api-workforce-foundation-application'

/** Team subjects of an actor on one date. */
export interface TeamScope {
	/** The actor's current assignments that act as managers. */
	managerAssignmentIds: string[]
	/** Workers with an assignment whose current primary solid line points to one of them. */
	workerIds: string[]
}

/**
 * Resolve Team subjects under DEC-HCM2-015. The reporting line only selects subjects; callers must
 * already hold the team permission, and membership is recomputed for every request.
 */
export class TeamScopeResolver {
	/** Read reporting data through the workforce read port of the same transaction. */
	constructor(private readonly reads: WorkforceReadPort) {}

	/** Direct reports of the actor's account on a date; empty when the actor is not a worker. */
	async resolve(accountId: string, asOf: string): Promise<TeamScope> {
		const workerId = await this.reads.accountWorker(accountId)
		if (!workerId) return { managerAssignmentIds: [], workerIds: [] }
		const managerAssignmentIds = (await this.reads.currentAssignments(workerId, asOf)).map(
			/** Assignment identity. */ (assignment) => assignment.id,
		)
		const reports = await this.reads.directReports(managerAssignmentIds, asOf)
		return {
			managerAssignmentIds,
			workerIds: [...new Set(reports.map(/** Report identity. */ (edge) => edge.workerId))].filter(
				/** An actor is never a member of their own team. */ (id) => id !== workerId,
			),
		}
	}

	/** Whether a worker is in the actor's team on a date. */
	async includes(accountId: string, workerId: string, asOf: string): Promise<boolean> {
		return (await this.resolve(accountId, asOf)).workerIds.includes(workerId)
	}
}
