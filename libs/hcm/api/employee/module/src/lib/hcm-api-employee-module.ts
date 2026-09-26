import { Global, Module } from '@nestjs/common'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'
import { HcmAccessControlModule } from '@empflowyee/hcm-api-access-control-module'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import { HcmWorkforceFoundationModule } from '@empflowyee/hcm-api-workforce-foundation-module'
import {
	EmployeeDirectory,
	EmployeePortBinder,
	EmployeeUnitOfWork,
	ProfileConfiguration,
	TeamDirectory,
} from '@empflowyee/hcm-api-employee-application'
import {
	OrgChartFieldPolicyBinder,
	WorkforcePortBinder,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import {
	KyselyEmployeePortBinder,
	KyselyEmployeeUnitOfWork,
	KyselyOrgChartFieldPolicyBinder,
} from '@empflowyee/hcm-api-employee-infrastructure'
import {
	DirectoryController,
	ProfileConfigurationController,
	TeamController,
} from '@empflowyee/hcm-api-employee-transport'

/**
 * Employee composition. Global so the workforce org chart can inject the
 * `OrgChartFieldPolicyBinder` it declares without a workforce-to-employee library dependency;
 * the HCM API root imports this module once.
 */
@Global()
@Module({
	imports: [HcmRuntimeModule, HcmAccessControlModule, HcmWorkforceFoundationModule],
	controllers: [ProfileConfigurationController, DirectoryController, TeamController],
	providers: [
		{
			provide: EmployeeUnitOfWork,
			inject: [HcmAccessDatabase, WorkforcePortBinder],
			useFactory: /** Bind employee adapters to the existing authorized transaction boundary. */ (
				database: HcmAccessDatabase | null,
				workforce: WorkforcePortBinder,
			) => new KyselyEmployeeUnitOfWork(database, workforce),
		},
		{
			provide: ProfileConfiguration,
			inject: [EmployeeUnitOfWork],
			useFactory: /** Compose the profile configuration use cases. */ (unit: EmployeeUnitOfWork) =>
				new ProfileConfiguration(unit),
		},
		{
			provide: EmployeeDirectory,
			inject: [EmployeeUnitOfWork],
			useFactory: /** Compose the read-only directory use cases. */ (unit: EmployeeUnitOfWork) =>
				new EmployeeDirectory(unit),
		},
		{
			provide: TeamDirectory,
			inject: [EmployeeUnitOfWork],
			useFactory: /** Compose the read-only team use cases. */ (unit: EmployeeUnitOfWork) =>
				new TeamDirectory(unit),
		},
		{
			provide: EmployeePortBinder,
			inject: [WorkforcePortBinder],
			useFactory: /** Bind employee ports on top of the workforce read port. */ (
				workforce: WorkforcePortBinder,
			) => new KyselyEmployeePortBinder(workforce),
		},
		{
			provide: OrgChartFieldPolicyBinder,
			useFactory: /** Implement the org chart's declared field policy. */ () =>
				new KyselyOrgChartFieldPolicyBinder(),
		},
	],
	exports: [
		EmployeeUnitOfWork,
		ProfileConfiguration,
		EmployeePortBinder,
		OrgChartFieldPolicyBinder,
	],
})
export class HcmEmployeeModule {}
