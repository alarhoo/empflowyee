import { Global, Module } from '@nestjs/common'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'
import { HcmAccessControlModule } from '@empflowyee/hcm-api-access-control-module'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import { HcmWorkforceFoundationModule } from '@empflowyee/hcm-api-workforce-foundation-module'
import { HcmJobArchitectureModule } from '@empflowyee/hcm-api-job-architecture-module'
import { PositionReadPortBinder } from '@empflowyee/hcm-api-job-architecture-application'
import { HcmDocumentsModule } from '@empflowyee/hcm-api-documents-module'
import { DocumentStoragePort } from '@empflowyee/hcm-api-documents-application'
import {
	EmployeeDirectory,
	EmployeeImport,
	EmployeePortBinder,
	EmployeeRecords,
	EmployeeUnitOfWork,
	EmploymentChanges,
	HrServiceDesk,
	MyProfile,
	ProbationManagement,
	ProbationReview,
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
	EmployeeImportController,
	EmployeeRecordsController,
	EmploymentChangesController,
	HrServiceDeskController,
	MyProfileController,
	ProbationManagementController,
	ProbationReviewController,
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
	imports: [
		HcmRuntimeModule,
		HcmAccessControlModule,
		HcmWorkforceFoundationModule,
		HcmJobArchitectureModule,
		HcmDocumentsModule,
	],
	controllers: [
		ProfileConfigurationController,
		DirectoryController,
		TeamController,
		MyProfileController,
		EmployeeRecordsController,
		EmploymentChangesController,
		EmployeeImportController,
		ProbationManagementController,
		ProbationReviewController,
		HrServiceDeskController,
	],
	providers: [
		{
			provide: EmployeeUnitOfWork,
			inject: [HcmAccessDatabase, WorkforcePortBinder, PositionReadPortBinder, DocumentStoragePort],
			useFactory: /** Bind employee adapters to the existing authorized transaction boundary. */ (
				database: HcmAccessDatabase | null,
				workforce: WorkforcePortBinder,
				positions: PositionReadPortBinder,
				documents: DocumentStoragePort,
			) => new KyselyEmployeeUnitOfWork(database, workforce, positions, documents),
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
			provide: MyProfile,
			inject: [EmployeeUnitOfWork],
			useFactory: /** Compose the self-service use cases. */ (unit: EmployeeUnitOfWork) =>
				new MyProfile(unit),
		},
		{
			provide: EmploymentChanges,
			inject: [EmployeeUnitOfWork],
			useFactory: /** Compose the employment change use cases. */ (unit: EmployeeUnitOfWork) =>
				new EmploymentChanges(unit),
		},
		{
			provide: EmployeeImport,
			inject: [EmployeeUnitOfWork],
			useFactory: /** Compose the employee import use cases. */ (unit: EmployeeUnitOfWork) =>
				new EmployeeImport(unit),
		},
		{
			provide: ProbationManagement,
			inject: [EmployeeUnitOfWork],
			useFactory: /** Compose the probation management use cases. */ (unit: EmployeeUnitOfWork) =>
				new ProbationManagement(unit),
		},
		{
			provide: ProbationReview,
			inject: [EmployeeUnitOfWork],
			useFactory: /** Compose the probation reviewer use cases. */ (unit: EmployeeUnitOfWork) =>
				new ProbationReview(unit),
		},
		{
			provide: HrServiceDesk,
			inject: [EmployeeUnitOfWork],
			useFactory: /** Compose the HR service desk use cases. */ (unit: EmployeeUnitOfWork) =>
				new HrServiceDesk(unit),
		},
		{
			provide: EmployeeRecords,
			inject: [EmployeeUnitOfWork],
			useFactory: /** Compose the HR records use cases. */ (unit: EmployeeUnitOfWork) =>
				new EmployeeRecords(unit),
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
