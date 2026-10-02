import {
	runHcmWorker,
	HcmTransactionalWorkerLane,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import {
	KyselyAttendanceResolveHandler,
	KyselyHolidayPreviewHandler,
	KyselyAttendanceConfigurationInputBinder,
} from '@empflowyee/hcm-api-attendance-infrastructure'
import { KyselyWorkforceTimeContextBinder } from '@empflowyee/hcm-api-workforce-foundation-infrastructure'

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
		/** Compose delivered workday resolution and Holiday preview handlers; other workloads remain unavailable. */
		lanes: (_database, store) => [
			new HcmTransactionalWorkerLane('AttendanceResolve', store, [
				new KyselyHolidayPreviewHandler(new KyselyWorkforceTimeContextBinder()),
				new KyselyAttendanceResolveHandler(
					new KyselyAttendanceConfigurationInputBinder(new KyselyWorkforceTimeContextBinder()),
				),
			]),
		],
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
