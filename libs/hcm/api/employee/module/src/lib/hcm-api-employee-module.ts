import { Global, Module } from '@nestjs/common'
import { HcmWorkforceFoundationModule } from '@empflowyee/hcm-api-workforce-foundation-module'
import { EmployeePortBinder } from '@empflowyee/hcm-api-employee-application'
import {
	OrgChartFieldPolicyBinder,
	WorkforcePortBinder,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import {
	KyselyEmployeePortBinder,
	KyselyOrgChartFieldPolicyBinder,
} from '@empflowyee/hcm-api-employee-infrastructure'

/**
 * Employee profile policy composition. Global so the workforce org chart can inject the
 * `OrgChartFieldPolicyBinder` it declares without a workforce-to-employee library dependency;
 * the HCM API root imports this module once.
 */
@Global()
@Module({
	imports: [HcmWorkforceFoundationModule],
	providers: [
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
	exports: [EmployeePortBinder, OrgChartFieldPolicyBinder],
})
export class HcmEmployeeModule {}
