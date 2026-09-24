import { Module } from '@nestjs/common'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'
import { HcmAccessControlModule } from '@empflowyee/hcm-api-access-control-module'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import {
	IdentityAdministration,
	SecuritySummaryReader,
	DomainProjectionReader,
	IdentityUnitOfWork,
} from '@empflowyee/hcm-api-identity-access-application'
import {
	KyselyIdentityUnitOfWork,
	KyselySecuritySummaryReader,
	KyselyDomainProjectionReader,
} from '@empflowyee/hcm-api-identity-access-infrastructure'
import {
	IdentityAdministrationController,
	SecuritySummaryController,
	DomainProjectionController,
} from '@empflowyee/hcm-api-identity-access-transport'
@Module({
	imports: [HcmRuntimeModule, HcmAccessControlModule],
	controllers: [
		IdentityAdministrationController,
		DomainProjectionController,
		SecuritySummaryController,
	],
	providers: [
		{
			provide: SecuritySummaryReader,
			inject: [HcmAccessDatabase],
			useFactory: /** Bind authorized own-account projections. */ (
				database: HcmAccessDatabase | null,
			) => new KyselySecuritySummaryReader(database),
		},
		{
			provide: DomainProjectionReader,
			inject: [HcmAccessDatabase],
			useFactory: /** Read the runtime-owned directory through an authorized adapter. */ (
				database: HcmAccessDatabase | null,
			) => new KyselyDomainProjectionReader(database),
		},
		{
			provide: IdentityUnitOfWork,
			inject: [HcmAccessDatabase],
			useFactory: /** Bind identity adapters to the existing local access transaction boundary. */ (
				database: HcmAccessDatabase | null,
			) => new KyselyIdentityUnitOfWork(database),
		},
		{
			provide: IdentityAdministration,
			inject: [IdentityUnitOfWork],
			useFactory: /** Compose framework-independent account use cases. */ (
				unit: IdentityUnitOfWork,
			) => new IdentityAdministration(unit),
		},
	],
})
export class HcmIdentityAccessModule {}
