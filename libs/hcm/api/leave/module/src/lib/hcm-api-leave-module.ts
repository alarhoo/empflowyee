import { Module } from '@nestjs/common'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'
import { FieldCipher } from '@empflowyee/hcm-api-runtime-application'
import { HcmAccessControlModule } from '@empflowyee/hcm-api-access-control-module'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import {
	LeavePolicyCommands,
	LeavePolicyUnit,
	LeaveEnrollmentCommands,
	LeaveEnrollmentUnit,
	LeaveRequestDraftUnit,
	LeaveRequestDraftCommands,
} from '@empflowyee/hcm-api-leave-application'
import {
	KyselyLeavePolicyUnit,
	KyselyLeaveEnrollmentUnit,
	KyselyLeaveRequestDraftUnit,
} from '@empflowyee/hcm-api-leave-infrastructure'
import { HcmWorkforceFoundationModule } from '@empflowyee/hcm-api-workforce-foundation-module'
import {
	WorkforceTimeContextBinder,
	WorkforceLeaveEligibilityBinder,
	WorkforceApprovalRoutingBinder,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import {
	LeavePoliciesController,
	LeavePolicyOptionsController,
	LeaveEnrollmentsController,
	LeaveRequestsController,
} from '@empflowyee/hcm-api-leave-transport'
import { HcmAttendanceModule } from '@empflowyee/hcm-api-attendance-module'
import { AttendancePublishedWorkdayBinder } from '@empflowyee/hcm-api-attendance-application'

/** Compose Leave's source-owned commands without API scheduling loops or implicit migrations. */
@Module({
	imports: [
		HcmRuntimeModule,
		HcmAccessControlModule,
		HcmWorkforceFoundationModule,
		HcmAttendanceModule,
	],
	controllers: [
		LeavePoliciesController,
		LeavePolicyOptionsController,
		LeaveEnrollmentsController,
		LeaveRequestsController,
	],
	providers: [
		{
			provide: LeaveRequestDraftUnit,
			inject: [
				HcmAccessDatabase,
				FieldCipher,
				WorkforceTimeContextBinder,
				WorkforceApprovalRoutingBinder,
				WorkforceLeaveEligibilityBinder,
				AttendancePublishedWorkdayBinder,
			],
			useFactory:
			/** Reuse current authority, Workforce self/eligibility and published Attendance source ports. */ (
				database: HcmAccessDatabase | null,
				cipher: FieldCipher,
				workforce: WorkforceTimeContextBinder,
				ownership: WorkforceApprovalRoutingBinder,
				eligibility: WorkforceLeaveEligibilityBinder,
				workdays: AttendancePublishedWorkdayBinder,
			) =>
				new KyselyLeaveRequestDraftUnit(
					database,
					cipher,
					workforce,
					ownership,
					eligibility,
					workdays,
				),
		},
		{
			provide: LeaveRequestDraftCommands,
			inject: [LeaveRequestDraftUnit],
			useFactory:
			/** Compose self-service Draft commands without API scheduling or funding side effects. */ (
				unit: LeaveRequestDraftUnit,
			) => new LeaveRequestDraftCommands(unit),
		},
		{
			provide: LeaveEnrollmentUnit,
			inject: [
				HcmAccessDatabase,
				FieldCipher,
				WorkforceTimeContextBinder,
				WorkforceLeaveEligibilityBinder,
			],
			useFactory:
			/** Keep enrollment authority and both Workforce owner ports in one transaction. */ (
				database: HcmAccessDatabase | null,
				cipher: FieldCipher,
				workforce: WorkforceTimeContextBinder,
				eligibility: WorkforceLeaveEligibilityBinder,
			) => new KyselyLeaveEnrollmentUnit(database, cipher, workforce, eligibility),
		},
		{
			provide: LeaveEnrollmentCommands,
			inject: [LeaveEnrollmentUnit],
			useFactory:
			/** Compose real admission commands without a background scheduler in the API. */ (
				unit: LeaveEnrollmentUnit,
			) => new LeaveEnrollmentCommands(unit),
		},
		{
			provide: LeavePolicyUnit,
			inject: [HcmAccessDatabase, FieldCipher],
			useFactory: /** Reuse current Access transactions and tenant field encryption. */ (
				database: HcmAccessDatabase | null,
				cipher: FieldCipher,
			) => new KyselyLeavePolicyUnit(database, cipher),
		},
		{
			provide: LeavePolicyCommands,
			inject: [LeavePolicyUnit],
			useFactory: /** Bind business orchestration to the authorized infrastructure unit. */ (
				unit: LeavePolicyUnit,
			) => new LeavePolicyCommands(unit),
		},
	],
})
export class HcmLeaveModule {}
