import { Module } from '@nestjs/common'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'
import { HcmAccessControlModule } from '@empflowyee/hcm-api-access-control-module'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import {
	IdentityAdministration,
	IdentityUnitOfWork,
} from '@empflowyee/hcm-api-identity-access-application'
import { KyselyIdentityUnitOfWork } from '@empflowyee/hcm-api-identity-access-infrastructure'
import { IdentityAdministrationController } from '@empflowyee/hcm-api-identity-access-transport'
@Module({
	imports: [HcmRuntimeModule, HcmAccessControlModule],
	controllers: [IdentityAdministrationController],
	providers: [
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
