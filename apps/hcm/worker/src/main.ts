import {
	runHcmWorker,
	HcmTransactionalWorkerLane,
	KyselyHcmActionAuthorizationBinder,
	createFieldCipher,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import {
	KyselyAttendanceResolveHandler,
	KyselyHolidayPreviewHandler,
	KyselyDatedConfigurationPreviewHandler,
	KyselyAttendanceConfigurationInputBinder,
	KyselyAttendanceWorkflowSourceBinder,
	KyselyAttendanceWorkflowActionBinder,
} from '@empflowyee/hcm-api-attendance-infrastructure'
import {
	KyselyWorkforceTimeContextBinder,
	KyselyWorkforceApprovalRoutingBinder,
} from '@empflowyee/hcm-api-workforce-foundation-infrastructure'
import { KyselyApprovalCandidateBinder } from '@empflowyee/hcm-api-access-control-infrastructure'
import {
	KyselyWorkflowPlanHandler,
	KyselyWorkflowDispatchHandler,
	KyselyWorkflowReconcileHandler,
} from '@empflowyee/hcm-api-workflow-infrastructure'

import { KyselyLeaveWorkdayImpactBinder } from '@empflowyee/hcm-api-leave-infrastructure'

const shutdown = new AbortController()
/** Stop new claims; current fenced transactions settle before their pools close. */
function stop(): void {
	shutdown.abort()
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)

void runHcmWorker(
	process.env,
	{
		/** Compose only implemented owner handlers; dispatch consumes the same private field key as the API. */
		lanes: (_database, store) => {
			const workforce = new KyselyWorkforceTimeContextBinder(),
				routing = new KyselyWorkforceApprovalRoutingBinder()
			const sources = new KyselyAttendanceWorkflowSourceBinder(
				workforce,
				routing,
				new KyselyApprovalCandidateBinder(),
			)
			const authorities = new KyselyHcmActionAuthorizationBinder()
			if (
				process.env['HCM_WORKER_WORKLOADS']?.split(',').includes('WorkflowDispatch') &&
				!process.env['HCM_LOCAL_FIELD_KEY']
			)
				throw new Error('Workflow dispatch requires the existing local field key')
			const cipher = createFieldCipher(process.env)
			const actions = new KyselyAttendanceWorkflowActionBinder(
				workforce,
				routing,
				sources,
				authorities,
				cipher,
				new KyselyLeaveWorkdayImpactBinder(),
			)
			return [
				new HcmTransactionalWorkerLane('WorkflowPlan', store, [
					new KyselyWorkflowPlanHandler(sources),
				]),
				new HcmTransactionalWorkerLane('WorkflowDispatch', store, [
					new KyselyWorkflowDispatchHandler(actions, cipher, authorities),
				]),
				new HcmTransactionalWorkerLane('WorkflowReconcile', store, [
					new KyselyWorkflowReconcileHandler(sources),
				]),
				new HcmTransactionalWorkerLane('AttendanceResolve', store, [
					new KyselyDatedConfigurationPreviewHandler(
						workforce,
						new KyselyLeaveWorkdayImpactBinder(),
					),
					new KyselyHolidayPreviewHandler(workforce),
					new KyselyAttendanceResolveHandler(
						new KyselyAttendanceConfigurationInputBinder(workforce),
					),
				]),
			]
		},
		/** Write aggregate operational counters only; source reasons, employee identifiers and payloads never enter logs. */
		report: (result) => console.log(JSON.stringify({ event: 'hcm-worker-drain', ...result })),
	},
	shutdown.signal,
)
	.catch(
		/** Keep connection credentials and database diagnostics out of process output. */ () => {
			console.error(
				'HCM worker unavailable: verify local configuration, registered workloads and database readiness.',
			)
			process.exitCode = 1
		},
	)
	.finally(
		/** Remove handlers after finite execution so the process exits normally. */ () => {
			process.removeListener('SIGINT', stop)
			process.removeListener('SIGTERM', stop)
		},
	)
