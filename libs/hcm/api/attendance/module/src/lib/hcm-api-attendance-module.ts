import { HcmWorkforceFoundationModule } from '@empflowyee/hcm-api-workforce-foundation-module'
import {
	WorkforceTimeContextBinder,
	WorkforceTimeSubjectsBinder,
	WorkforcePortBinder,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import { Module } from '@nestjs/common'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'
import { FieldCipher } from '@empflowyee/hcm-api-runtime-application'
import { HcmAccessControlModule } from '@empflowyee/hcm-api-access-control-module'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import {
	AttendancePeriodFenceBinder,
	AttendanceConfigurationInputBinder,
	AttendanceScheduleUnitOfWork,
	WorkConfigurationUnitOfWork,
	AttendanceWorkConfigurationDrafts,
	AttendanceWorkReferences,
	AttendanceWorkdayReadPort,
	AttendanceWorkdayQueries,
	AttendanceWorkAssignmentUnit,
	AttendanceWorkAssignments,
	AttendanceDatedPublicationUnit,
	AttendanceDatedPublication,
	AttendancePolicyPublication,
	AttendanceHolidayUnitOfWork,
	AttendanceHolidayAssignmentUnit,
	AttendanceHolidayAssignments,
	AttendanceHolidayDrafts,
	AttendanceHolidayPublication,
	AttendanceHolidayReferences,
	AttendanceHolidayQueries,
	AttendanceScheduleDrafts,
	AttendanceScheduleQueries,
	AttendanceTemplatePublication,
} from '@empflowyee/hcm-api-attendance-application'
import {
	KyselyAttendancePeriodFenceBinder,
	KyselyAttendanceConfigurationInputBinder,
	KyselyAttendanceScheduleUnit,
	KyselyWorkConfigurationUnit,
	KyselyAttendanceWorkdayQueries,
	KyselyWorkAssignmentUnit,
	KyselyDatedPublicationUnit,
	KyselyAttendanceHolidayUnit,
	KyselyHolidayAssignmentUnit,
} from '@empflowyee/hcm-api-attendance-infrastructure'
import {
	ScheduleTemplatesController,
	WorkConfigurationsController,
	WorkSchedulesController,
	AttendanceWorkdaysController,
	WorkAssignmentsController,
	DatedPublicationController,
	PolicyPublicationController,
	HolidayCalendarsController,
	HolidayAssignmentsController,
} from '@empflowyee/hcm-api-attendance-transport'

/** Attendance composition owns no scheduler loop or startup migration. */
@Module({
	imports: [HcmRuntimeModule, HcmAccessControlModule, HcmWorkforceFoundationModule],
	controllers: [
		AttendanceWorkdaysController,
		DatedPublicationController,
		WorkAssignmentsController,
		PolicyPublicationController,
		WorkSchedulesController,
		WorkConfigurationsController,
		ScheduleTemplatesController,
		HolidayCalendarsController,
		HolidayAssignmentsController,
	],
	exports: [AttendanceConfigurationInputBinder, AttendancePeriodFenceBinder],
	providers: [
		{
			provide: AttendanceWorkdayReadPort,
			inject: [HcmAccessDatabase, WorkforceTimeContextBinder],
			useFactory: /** Reuse dated Workforce scope authorization before stored evidence is read. */ (
				database: HcmAccessDatabase | null,
				workforce: WorkforceTimeContextBinder,
			) => new KyselyAttendanceWorkdayQueries(database, workforce),
		},
		{
			provide: AttendanceWorkdayQueries,
			inject: [AttendanceWorkdayReadPort],
			useFactory: /** Keep query validation in the owning application layer. */ (
				reads: AttendanceWorkdayReadPort,
			) => new AttendanceWorkdayQueries(reads),
		},
		{
			provide: AttendanceDatedPublicationUnit,
			inject: [HcmAccessDatabase, FieldCipher, WorkforceTimeContextBinder],
			useFactory:
			/** Compose dated source validation on the existing transaction and workforce ports. */ (
				database: HcmAccessDatabase | null,
				cipher: FieldCipher,
				workforce: WorkforceTimeContextBinder,
			) => new KyselyDatedPublicationUnit(database, cipher, workforce),
		},
		{
			provide: AttendanceDatedPublication,
			inject: [AttendanceDatedPublicationUnit],
			useFactory:
			/** Bind source lifecycle behavior to current-authority evidence and receipts. */ (
				unit: AttendanceDatedPublicationUnit,
			) => new AttendanceDatedPublication(unit),
		},
		{
			provide: AttendanceWorkAssignmentUnit,
			inject: [
				HcmAccessDatabase,
				FieldCipher,
				WorkforceTimeContextBinder,
				WorkforceTimeSubjectsBinder,
			],
			useFactory:
			/** Compose dated scope, period fences and durable producers through existing owner ports. */ (
				database: HcmAccessDatabase | null,
				cipher: FieldCipher,
				workforce: WorkforceTimeContextBinder,
				subjects: WorkforceTimeSubjectsBinder,
			) => new KyselyWorkAssignmentUnit(database, cipher, workforce, subjects),
		},
		{
			provide: AttendanceWorkAssignments,
			inject: [AttendanceWorkAssignmentUnit],
			useFactory:
			/** Bind scoped assignment commands without putting business behavior in the module. */ (
				unit: AttendanceWorkAssignmentUnit,
			) => new AttendanceWorkAssignments(unit),
		},
		{
			provide: AttendancePolicyPublication,
			inject: [WorkConfigurationUnitOfWork],
			useFactory: /** Bind immutable policy publication to source-owned rule evidence. */ (
				unit: WorkConfigurationUnitOfWork,
			) => new AttendancePolicyPublication(unit),
		},
		{
			provide: WorkConfigurationUnitOfWork,
			inject: [HcmAccessDatabase, FieldCipher, WorkforcePortBinder],
			useFactory: /** Reuse current-authority transactions and encrypted source receipts. */ (
				database: HcmAccessDatabase | null,
				cipher: FieldCipher,
				references: WorkforcePortBinder,
			) => new KyselyWorkConfigurationUnit(database, cipher, references),
		},
		{
			provide: AttendanceWorkReferences,
			inject: [WorkConfigurationUnitOfWork],
			useFactory: /** Bind minimal selectors to current Work Schedules read authority. */ (
				unit: WorkConfigurationUnitOfWork,
			) => new AttendanceWorkReferences(unit),
		},
		{
			provide: AttendanceWorkConfigurationDrafts,
			inject: [WorkConfigurationUnitOfWork],
			useFactory:
			/** Bind the policy and shift source commands to their owning transaction port. */ (
				unit: WorkConfigurationUnitOfWork,
			) => new AttendanceWorkConfigurationDrafts(unit),
		},
		{
			provide: AttendanceHolidayAssignmentUnit,
			inject: [
				HcmAccessDatabase,
				FieldCipher,
				WorkforceTimeContextBinder,
				WorkforceTimeSubjectsBinder,
			],
			useFactory:
			/** Compose scope enumeration, time facts and transactional assignments from existing owner ports. */ (
				database: HcmAccessDatabase | null,
				cipher: FieldCipher,
				workforce: WorkforceTimeContextBinder,
				subjects: WorkforceTimeSubjectsBinder,
			) => new KyselyHolidayAssignmentUnit(database, cipher, workforce, subjects),
		},
		{
			provide: AttendanceHolidayAssignments,
			inject: [AttendanceHolidayAssignmentUnit],
			useFactory: /** Bind assignment behavior without putting business logic in the root. */ (
				unit: AttendanceHolidayAssignmentUnit,
			) => new AttendanceHolidayAssignments(unit),
		},
		{
			provide: AttendancePeriodFenceBinder,
			useFactory: /** Bind the monthly publication fence to the current source transaction. */ () =>
				new KyselyAttendancePeriodFenceBinder(),
		},
		{
			provide: AttendanceConfigurationInputBinder,
			inject: [WorkforceTimeContextBinder],
			useFactory: /** Compose owner ports without reciprocal persistence dependencies. */ (
				workforce: WorkforceTimeContextBinder,
			) => new KyselyAttendanceConfigurationInputBinder(workforce),
		},
		{
			provide: AttendanceHolidayUnitOfWork,
			inject: [HcmAccessDatabase, FieldCipher, WorkforceTimeContextBinder, WorkforcePortBinder],
			useFactory: /** Compose holiday transactions with existing encryption. */ (
				database: HcmAccessDatabase | null,
				cipher: FieldCipher,
				workforce: WorkforceTimeContextBinder,
				references: WorkforcePortBinder,
			) => new KyselyAttendanceHolidayUnit(database, cipher, workforce, references),
		},
		{
			provide: AttendanceHolidayReferences,
			inject: [AttendanceHolidayUnitOfWork],
			useFactory: /** Compose minimal selectors under their own calendar operation authority. */ (
				unit: AttendanceHolidayUnitOfWork,
			) => new AttendanceHolidayReferences(unit),
		},
		{
			provide: AttendanceHolidayPublication,
			inject: [AttendanceHolidayUnitOfWork],
			useFactory: /** Bind publication commands to their real durable validation adapter. */ (
				unit: AttendanceHolidayUnitOfWork,
			) => new AttendanceHolidayPublication(unit),
		},
		{
			provide: AttendanceHolidayDrafts,
			inject: [AttendanceHolidayUnitOfWork],
			useFactory: /** Bind holiday draft commands to the owner port. */ (
				unit: AttendanceHolidayUnitOfWork,
			) => new AttendanceHolidayDrafts(unit),
		},
		{
			provide: AttendanceHolidayQueries,
			inject: [AttendanceHolidayUnitOfWork],
			useFactory: /** Bind calendar list requests to current read authority. */ (
				unit: AttendanceHolidayUnitOfWork,
			) => new AttendanceHolidayQueries(unit),
		},
		{
			provide: AttendanceScheduleUnitOfWork,
			inject: [HcmAccessDatabase, FieldCipher],
			useFactory: /** Bind current-authority transactions and tenant encryption. */ (
				database: HcmAccessDatabase | null,
				cipher: FieldCipher,
			) => new KyselyAttendanceScheduleUnit(database, cipher),
		},
		{
			provide: AttendanceScheduleDrafts,
			inject: [AttendanceScheduleUnitOfWork],
			useFactory: /** Compose Draft commands against the owner transaction port. */ (
				unit: AttendanceScheduleUnitOfWork,
			) => new AttendanceScheduleDrafts(unit),
		},
		{
			provide: AttendanceScheduleQueries,
			inject: [AttendanceScheduleUnitOfWork],
			useFactory: /** Compose server-paged current-authority reads. */ (
				unit: AttendanceScheduleUnitOfWork,
			) => new AttendanceScheduleQueries(unit),
		},
		{
			provide: AttendanceTemplatePublication,
			inject: [AttendanceScheduleUnitOfWork],
			useFactory: /** Compose actor-bound preview publication and retirement. */ (
				unit: AttendanceScheduleUnitOfWork,
			) => new AttendanceTemplatePublication(unit),
		},
	],
})
export class HcmAttendanceModule {}
