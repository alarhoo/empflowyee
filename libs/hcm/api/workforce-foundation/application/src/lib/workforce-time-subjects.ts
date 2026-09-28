/** One explicit Workforce-owned target for internal time-impact enumeration; selection never grants authority. */
export type WorkforceTimeTarget =
	| { kind: 'Tenant' }
	| {
		kind: 'LegalEntity' | 'OrgUnit' | 'Department' | 'Location' | 'Assignment' | 'Employment'
		id: string
	}

export interface WorkforceTimeSubjectPage {
	items: { employmentId: string; employmentRevision: number }[]
	nextAfterEmploymentId: string | null
}
export interface WorkforceTimeSubjectsPort {
	/** Enumerate one dated scope in bounded stable identity order under caller-owned tenant authority; the continuation is internal only. */
	page(
		workDate: string,
		target: WorkforceTimeTarget,
		afterEmploymentId?: string,
		limit?: number,
	): Promise<WorkforceTimeSubjectPage>
}
export abstract class WorkforceTimeSubjectsBinder {
	/** Bind only the consuming source's authorized tenant transaction; no independent query connection or authority is created. */
	abstract bind(transaction: unknown, tenantId: string): WorkforceTimeSubjectsPort
}
