import { HttpException, type Logger } from '@nestjs/common'
import type { HcmRequestTenantContext } from '@empflowyee/hcm-api-runtime-transport'
import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import { NotificationError } from '@empflowyee/hcm-notifications-contract'
import { runAccessRequest, type RoleResponse } from '@empflowyee/hcm-api-access-control-transport'
/** Translate known notification failures while preserving shared safe access handling. */
export function runNotificationRequest<T>(
	requestContext: HcmRequestTenantContext,
	logger: Logger,
	response: RoleResponse,
	work: (context: AuthenticatedHcmContext) => Promise<T>,
): Promise<T> {
	return runAccessRequest(
		requestContext,
		logger,
		response,
		/** Translate bounded notification error codes without disclosing SQL. */ async (context) => {
			try {
				return await work(context)
			} catch (error) {
				if (error instanceof NotificationError)
					throw new HttpException(
						{ code: error.code, requestId: requestContext.requestId },
						({ 'invalid-request': 400, 'not-found': 404 } as Record<string, number>)[error.code] ??
							409,
					)
				throw error
			}
		},
	)
}
