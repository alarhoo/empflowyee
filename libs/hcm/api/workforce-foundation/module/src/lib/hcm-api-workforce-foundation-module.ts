import { Module } from '@nestjs/common'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'
import { HcmAccessControlModule } from '@empflowyee/hcm-api-access-control-module'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import {
	IdentificationTypes,
	LookupValues,
	OrgChart,
	OrgChartFieldPolicyBinder,
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
	LookupValuesController,
	OrgChartController,
	OrganisationStructureController,
} from '@empflowyee/hcm-api-workforce-foundation-transport'

@Module({
	imports: [HcmRuntimeModule, HcmAccessControlModule],
	controllers: [
		OrganisationStructureController,
		IdentificationTypesController,
		LookupValuesController,
		OrgChartController,
	],
	providers: [
		{
			provide: WorkforceUnitOfWork,
			inject: [HcmAccessDatabase, { token: OrgChartFieldPolicyBinder, optional: true }],
			useFactory: /** Bind workforce adapters to the existing authorized transaction boundary. */ (
				database: HcmAccessDatabase | null,
				orgChartPolicy: OrgChartFieldPolicyBinder | null,
			) => new KyselyWorkforceUnitOfWork(database, orgChartPolicy ?? null),
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
			provide: LookupValues,
			inject: [WorkforceUnitOfWork],
			useFactory: /** Compose the lookup maintenance use cases. */ (unit: WorkforceUnitOfWork) =>
				new LookupValues(unit),
		},
		{
			provide: OrgChart,
			inject: [WorkforceUnitOfWork],
			useFactory: /** Compose the read-only org chart use cases. */ (unit: WorkforceUnitOfWork) =>
				new OrgChart(unit),
		},
		{
			provide: WorkforcePortBinder,
			useFactory: /** Let other domains bind workforce ports to their own transaction. */ () =>
				new KyselyWorkforcePortBinder(),
		},
	],
	exports: [
		WorkforceUnitOfWork,
		OrganisationStructure,
		IdentificationTypes,
		LookupValues,
		OrgChart,
		WorkforcePortBinder,
	],
})
export class HcmWorkforceFoundationModule {}
