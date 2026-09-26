import { Module } from '@nestjs/common'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'
import { HcmAccessControlModule } from '@empflowyee/hcm-api-access-control-module'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import {
	IdentificationTypes,
	OrganisationStructure,
	WorkforceUnitOfWork,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import { KyselyWorkforceUnitOfWork } from '@empflowyee/hcm-api-workforce-foundation-infrastructure'
import {
	IdentificationTypesController,
	OrganisationStructureController,
} from '@empflowyee/hcm-api-workforce-foundation-transport'

@Module({
	imports: [HcmRuntimeModule, HcmAccessControlModule],
	controllers: [OrganisationStructureController, IdentificationTypesController],
	providers: [
		{
			provide: WorkforceUnitOfWork,
			inject: [HcmAccessDatabase],
			useFactory: /** Bind workforce adapters to the existing authorized transaction boundary. */ (
				database: HcmAccessDatabase | null,
			) => new KyselyWorkforceUnitOfWork(database),
		},
		{
			provide: OrganisationStructure,
			inject: [WorkforceUnitOfWork],
			useFactory: /** Compose persistence-neutral structure use cases. */ (
				unit: WorkforceUnitOfWork,
			) => new OrganisationStructure(unit),
		},
		{
			provide: IdentificationTypes,
			inject: [WorkforceUnitOfWork],
			useFactory: /** Compose the read-only product catalogue use cases. */ (
				unit: WorkforceUnitOfWork,
			) => new IdentificationTypes(unit),
		},
	],
	exports: [WorkforceUnitOfWork, OrganisationStructure, IdentificationTypes],
})
export class HcmWorkforceFoundationModule {}
