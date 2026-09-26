import { Module } from '@nestjs/common'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'
import { HcmAccessControlModule } from '@empflowyee/hcm-api-access-control-module'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import { HcmWorkforceFoundationModule } from '@empflowyee/hcm-api-workforce-foundation-module'
import {
	JobArchitectureUnitOfWork,
	JobCatalogue,
	PositionReadPortBinder,
} from '@empflowyee/hcm-api-job-architecture-application'
import { JobCatalogueController } from '@empflowyee/hcm-api-job-architecture-transport'
import { WorkforcePortBinder } from '@empflowyee/hcm-api-workforce-foundation-application'
import {
	KyselyJobArchitectureUnitOfWork,
	KyselyPositionReadPortBinder,
} from '@empflowyee/hcm-api-job-architecture-infrastructure'

/** Job architecture composition over the shared access transaction boundary. */
@Module({
	imports: [HcmRuntimeModule, HcmAccessControlModule, HcmWorkforceFoundationModule],
	controllers: [JobCatalogueController],
	providers: [
		{
			provide: JobArchitectureUnitOfWork,
			inject: [HcmAccessDatabase, WorkforcePortBinder],
			useFactory: /** Bind job architecture adapters to the authorized transaction boundary. */ (
				database: HcmAccessDatabase | null,
				workforce: WorkforcePortBinder,
			) => new KyselyJobArchitectureUnitOfWork(database, workforce),
		},
		{
			provide: JobCatalogue,
			inject: [JobArchitectureUnitOfWork],
			useFactory: /** Compose the Job Catalogue use cases. */ (unit: JobArchitectureUnitOfWork) =>
				new JobCatalogue(unit),
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
