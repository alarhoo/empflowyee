import { Module } from '@nestjs/common'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'
import { HcmAccessControlModule } from '@empflowyee/hcm-api-access-control-module'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import {
	IdentificationTypes,
	OrganisationStructure,
	WorkforcePortBinder,
	WorkforceUnitOfWork,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import {
	KyselyWorkforcePortBinder,
	KyselyWorkforceUnitOfWork,
} from '@empflowyee/hcm-api-workforce-foundation-infrastructure'
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
		{
			provide: WorkforcePortBinder,
			useFactory: /** Let other domains bind workforce ports to their own transaction. */ () =>
				new KyselyWorkforcePortBinder(),
		},
	],
	exports: [WorkforceUnitOfWork, OrganisationStructure, IdentificationTypes, WorkforcePortBinder],
})
export class HcmWorkforceFoundationModule {}
