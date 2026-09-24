import { Module } from '@nestjs/common'
import type { Kysely } from 'kysely'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'
import { HcmAccessControlModule } from '@empflowyee/hcm-api-access-control-module'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import { AuditReader } from '@empflowyee/hcm-api-audit-application'
import { KyselyAuditReader, type AuditTables } from '@empflowyee/hcm-api-audit-infrastructure'
import { AuditLogController } from '@empflowyee/hcm-api-audit-transport'
/** Compose existing access authorization with the audit-owned query adapter without a dependency cycle. */
function auditReader(database: HcmAccessDatabase | null): AuditReader {
	return new KyselyAuditReader(
		/** Reauthorize every read inside the same tenant transaction. */ async (context, work) => {
			if (!database) throw new Error('Business runtime unavailable')
			return database.execute(
				context,
				{ permission: 'hcm.audit.events.read', entitlement: 'hcm.audit' },
				false,
				/** Supply only the already authorized executor and tenant. */ (scope) =>
					work(scope.transaction as unknown as Kysely<AuditTables>, scope.actor.tenantId),
			)
		},
		/** Authorize self-service independently from tenant audit administration. */ async (
			context,
			work,
		) => {
			if (!database) throw new Error('Business runtime unavailable')
			return database.execute(
				context,
				{ permission: 'hcm.audit.activity.self.read', entitlement: 'hcm.audit' },
				false,
				/** Supply the same verified tenant transaction to the self projection. */ (scope) =>
					work(scope.transaction as unknown as Kysely<AuditTables>, scope.actor.tenantId),
			)
		},
	)
}
@Module({
	imports: [HcmRuntimeModule, HcmAccessControlModule],
	controllers: [AuditLogController],
	providers: [{ provide: AuditReader, inject: [HcmAccessDatabase], useFactory: auditReader }],
})
export class HcmAuditModule {}
