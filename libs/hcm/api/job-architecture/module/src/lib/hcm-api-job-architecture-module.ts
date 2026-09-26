import { Module } from '@nestjs/common'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'
import { HcmAccessControlModule } from '@empflowyee/hcm-api-access-control-module'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import { HcmWorkforceFoundationModule } from '@empflowyee/hcm-api-workforce-foundation-module'
import { JobArchitectureUnitOfWork } from '@empflowyee/hcm-api-job-architecture-application'
import { WorkforcePortBinder } from '@empflowyee/hcm-api-workforce-foundation-application'
import { KyselyJobArchitectureUnitOfWork } from '@empflowyee/hcm-api-job-architecture-infrastructure'

/** Job architecture composition over the shared access transaction boundary. */
@Module({
	imports: [HcmRuntimeModule, HcmAccessControlModule, HcmWorkforceFoundationModule],
	providers: [
		{
			provide: JobArchitectureUnitOfWork,
			inject: [HcmAccessDatabase, WorkforcePortBinder],
			useFactory: /** Bind job architecture adapters to the authorized transaction boundary. */ (
				database: HcmAccessDatabase | null,
				workforce: WorkforcePortBinder,
			) => new KyselyJobArchitectureUnitOfWork(database, workforce),
		},
	],
	exports: [JobArchitectureUnitOfWork],
})
export class HcmJobArchitectureModule {}
