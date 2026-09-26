import { Module } from '@nestjs/common'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'
import { FieldCipher } from '@empflowyee/hcm-api-runtime-application'
import { HcmAccessControlModule } from '@empflowyee/hcm-api-access-control-module'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import { HcmWorkforceFoundationModule } from '@empflowyee/hcm-api-workforce-foundation-module'
import {
	JobArchitectureUnitOfWork,
	JobCatalogue,
	PositionReadPortBinder,
	Positions,
} from '@empflowyee/hcm-api-job-architecture-application'
import {
	JobCatalogueController,
	PositionsController,
} from '@empflowyee/hcm-api-job-architecture-transport'
import { WorkforcePortBinder } from '@empflowyee/hcm-api-workforce-foundation-application'
import {
	KyselyJobArchitectureUnitOfWork,
	KyselyPositionReadPortBinder,
} from '@empflowyee/hcm-api-job-architecture-infrastructure'

/** Job architecture composition over the shared access transaction boundary. */
@Module({
	imports: [HcmRuntimeModule, HcmAccessControlModule, HcmWorkforceFoundationModule],
	controllers: [JobCatalogueController, PositionsController],
	providers: [
		{
			provide: JobArchitectureUnitOfWork,
			inject: [HcmAccessDatabase, WorkforcePortBinder, FieldCipher],
			useFactory: /** Bind job architecture adapters to the authorized transaction boundary. */ (
				database: HcmAccessDatabase | null,
				workforce: WorkforcePortBinder,
				cipher: FieldCipher,
			) => new KyselyJobArchitectureUnitOfWork(database, workforce, cipher),
		},
		{
			provide: JobCatalogue,
			inject: [JobArchitectureUnitOfWork],
			useFactory: /** Compose the Job Catalogue use cases. */ (unit: JobArchitectureUnitOfWork) =>
				new JobCatalogue(unit),
		},
		{
			provide: Positions,
			inject: [JobArchitectureUnitOfWork],
			useFactory: /** Compose the Positions use cases. */ (unit: JobArchitectureUnitOfWork) =>
				new Positions(unit),
		},
		{
			provide: PositionReadPortBinder,
			inject: [WorkforcePortBinder],
			useFactory: /** Publish position reads to other domains. */ (
				workforce: WorkforcePortBinder,
			) => new KyselyPositionReadPortBinder(workforce),
		},
	],
	exports: [JobArchitectureUnitOfWork, PositionReadPortBinder],
})
export class HcmJobArchitectureModule {}
