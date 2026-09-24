import type { AuthenticatedHcmContext } from '@empflowyee/hcm-api-runtime-application'
import type { DomainProjection } from '@empflowyee/hcm-identity-access-contract'

/** Consumer-owned port for authorized reads of the runtime-owned tenant directory. */
export abstract class DomainProjectionReader {
	abstract read(context: AuthenticatedHcmContext): Promise<DomainProjection>
}
