import { HcmRuntimeError } from '@empflowyee/hcm-api-runtime-domain'

export const HCM_WORKLOADS = [
	'LeaveAccrual',
	'LeaveExpiry',
	'AttendanceResolve',
	'AttendanceCalculate',
	'AttendanceReconcile',
	'WorkflowPlan',
	'WorkflowDispatch',
	'WorkflowReconcile',
	'NotificationDispatch',
] as const
export type HcmWorkload = (typeof HCM_WORKLOADS)[number]

export interface HcmWorkloadContext {
	readonly workload: HcmWorkload
	readonly runId: string
}

export interface HcmWorkloadScope {
	readonly tenantId: string
	readonly workload: HcmWorkload
	readonly runId: string
	readonly expiresAt: number
}

export interface WorkloadTenantDirectory {
	/** Verify current tenant activation through the restricted runtime database adapter. */
	isActive(tenantId: string): Promise<boolean>
}

const verifiedWorkloads = new WeakMap<HcmWorkloadContext, Readonly<HcmWorkloadScope>>()

/** Issue internal capabilities only in the worker composition; never register this issuer in HTTP modules. */
export class HcmWorkloadIssuer {
	/** Bind the role-validated tenant directory and the bootstrap-selected workload allowlist. */
	constructor(
		private readonly tenants: WorkloadTenantDirectory,
		private readonly allowed: readonly HcmWorkload[],
	) {
		if (
			!allowed.length ||
			allowed.some(
				/** Deny unregistered workload names at startup. */ (workload) =>
					!HCM_WORKLOADS.includes(workload),
			)
		)
			throw new Error('Invalid HCM workload allowlist')
		this.allowed = Object.freeze([...allowed])
	}

	/** Require an active tenant and bounded lifetime before registering an opaque, non-serializable capability. */
	async issue(
		tenantId: string,
		workload: HcmWorkload,
		runId: string,
		lifetimeMs = 60000,
	): Promise<HcmWorkloadContext> {
		if (
			!tenantId ||
			tenantId.length > 200 ||
			!this.allowed.includes(workload) ||
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId) ||
			!Number.isSafeInteger(lifetimeMs) ||
			lifetimeMs < 1 ||
			lifetimeMs > 1800000
		)
			throw new HcmRuntimeError('forbidden')
		if (!(await this.tenants.isActive(tenantId))) throw new HcmRuntimeError('tenant-suspended')
		const context = Object.freeze({ workload, runId })
		verifiedWorkloads.set(
			context,
			Object.freeze({ tenantId, workload, runId, expiresAt: Date.now() + lifetimeMs }),
		)
		return context
	}
}

/** Reject copies, JSON envelopes, expired contexts and handlers for a different workload. */
export function requireWorkloadScope(
	context: HcmWorkloadContext,
	expected?: HcmWorkload,
): Readonly<HcmWorkloadScope> {
	const scope = verifiedWorkloads.get(context)
	if (!scope || scope.expiresAt <= Date.now()) throw new HcmRuntimeError('unauthenticated')
	if (expected && scope.workload !== expected) throw new HcmRuntimeError('forbidden')
	return scope
}
