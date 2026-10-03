import { HcmDocumentsModule } from '@empflowyee/hcm-api-documents-module'
import { DocumentEvidenceBinder } from '@empflowyee/hcm-api-documents-application'
import { AttendanceEvidence } from '@empflowyee/hcm-api-attendance-application'
import { AttendanceEvidenceController } from '@empflowyee/hcm-api-attendance-transport'
import { KyselyHcmActionAuthorizationBinder } from '@empflowyee/hcm-api-runtime-infrastructure'
import { HcmWorkforceFoundationModule } from '@empflowyee/hcm-api-workforce-foundation-module'
import {
	WorkforceTimeContextBinder,
	WorkforceApprovalRoutingBinder,
	WorkforceTimeSubjectsBinder,
	WorkforcePortBinder,
} from '@empflowyee/hcm-api-workforce-foundation-application'
import { Module } from '@nestjs/common'
import { KyselyLeaveWorkdayImpactBinder } from '@empflowyee/hcm-api-leave-infrastructure'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'
import { FieldCipher } from '@empflowyee/hcm-api-runtime-application'
import { HcmAccessControlModule } from '@empflowyee/hcm-api-access-control-module'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import { ApprovalCandidateBinder } from '@empflowyee/hcm-api-access-control-application'
import {
	WorkflowIntakeBinder,
	WorkflowActionBinder,
} from '@empflowyee/hcm-api-workflow-application'
import {
	KyselyWorkflowIntakeBinder,
	KyselyWorkflowActionBinder,
} from '@empflowyee/hcm-api-workflow-infrastructure'
import {
	AttendanceApprovalPort,
	AttendanceApprovalDecisions,
	AttendanceOverrideUnit,
	AttendanceOverrides,
	AttendancePeriodFenceBinder,
	AttendanceConfigurationInputBinder,
	AttendanceScheduleUnitOfWork,
	WorkConfigurationUnitOfWork,
	AttendanceWorkConfigurationDrafts,
	AttendanceWorkReferences,
	AttendanceWorkdayReadPort,
	AttendancePublishedWorkdayBinder,
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
	KyselyAttendanceApprovalPort,
	KyselyAttendanceWorkflowActionBinder,
	KyselyAttendanceOverrideUnit,
	KyselyAttendanceWorkflowSourceBinder,
	KyselyAttendancePeriodFenceBinder,
	KyselyAttendanceConfigurationInputBinder,
	KyselyAttendanceScheduleUnit,
	KyselyWorkConfigurationUnit,
	KyselyAttendanceWorkdayQueries,
	KyselyAttendancePublishedWorkdayBinder,
	KyselyWorkAssignmentUnit,
	KyselyDatedPublicationUnit,
	KyselyAttendanceHolidayUnit,
	KyselyHolidayAssignmentUnit,
} from '@empflowyee/hcm-api-attendance-infrastructure'
import {
	AttendanceApprovalDecisionsController,
	AttendanceOverridesController,
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
	imports: [
		HcmRuntimeModule,
		HcmAccessControlModule,
		HcmWorkforceFoundationModule,
		HcmDocumentsModule,
	],
	controllers: [
		AttendanceEvidenceController,
		AttendanceApprovalDecisionsController,
		AttendanceOverridesController,
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
	exports: [
		AttendanceConfigurationInputBinder,
		AttendancePeriodFenceBinder,
		AttendancePublishedWorkdayBinder,
	],
	providers: [
		{
			provide: AttendanceEvidence,
			inject: [AttendanceOverrideUnit],
			useFactory: /** Reuse the dated Override unit and its Documents owner port. */ (
				unit: AttendanceOverrideUnit,
			) => new AttendanceEvidence(unit),
		},
		{
			provide: KyselyAttendanceWorkflowActionBinder,
			inject: [
				WorkforceTimeContextBinder,
				WorkforceApprovalRoutingBinder,
				KyselyAttendanceWorkflowSourceBinder,
				FieldCipher,
			],
			useFactory:
			/** Register the concrete source decision owner behind the existing Runtime authority boundary. */ (
				workforce: WorkforceTimeContextBinder,
				routing: WorkforceApprovalRoutingBinder,
				sources: KyselyAttendanceWorkflowSourceBinder,
				cipher: FieldCipher,
			) =>
				new KyselyAttendanceWorkflowActionBinder(
					workforce,
					routing,
					sources,
					new KyselyHcmActionAuthorizationBinder(),
					cipher,
					new KyselyLeaveWorkdayImpactBinder(),
				),
		},
		{
			provide: WorkflowActionBinder,
			inject: [
				FieldCipher,
				KyselyAttendanceWorkflowSourceBinder,
				KyselyAttendanceWorkflowActionBinder,
			],
			useFactory: /** Reuse durable action admission without running workers in the API. */ (
				cipher: FieldCipher,
				sources: KyselyAttendanceWorkflowSourceBinder,
				actions: KyselyAttendanceWorkflowActionBinder,
			) =>
				new KyselyWorkflowActionBinder(
					cipher,
					new KyselyHcmActionAuthorizationBinder(),
					sources,
					actions,
				),
		},
		{
			provide: AttendanceApprovalPort,
			inject: [
				HcmAccessDatabase,
				WorkforceTimeContextBinder,
				KyselyAttendanceWorkflowSourceBinder,
				WorkflowActionBinder,
			],
			useFactory: /** Bind source HTTP commands to dated Access and owner coordination ports. */ (
				database: HcmAccessDatabase | null,
				workforce: WorkforceTimeContextBinder,
				sources: KyselyAttendanceWorkflowSourceBinder,
				actions: WorkflowActionBinder,
			) => new KyselyAttendanceApprovalPort(database, workforce, sources, actions),
		},
		{
			provide: AttendanceApprovalDecisions,
			inject: [AttendanceApprovalPort],
			useFactory: /** Keep source command validation in its application layer. */ (
				port: AttendanceApprovalPort,
			) => new AttendanceApprovalDecisions(port),
		},
		{
			provide: WorkflowIntakeBinder,
			useFactory:
			/** Bind durable coordination intake without starting scheduler loops in HTTP. */ () =>
				new KyselyWorkflowIntakeBinder(),
		},
		{
			provide: KyselyAttendanceWorkflowSourceBinder,
			inject: [WorkforceTimeContextBinder, WorkforceApprovalRoutingBinder, ApprovalCandidateBinder],
			useFactory: /** Compose the fixed Attendance source through owner-owned current facts. */ (
				workforce: WorkforceTimeContextBinder,
				routing: WorkforceApprovalRoutingBinder,
				access: ApprovalCandidateBinder,
			) => new KyselyAttendanceWorkflowSourceBinder(workforce, routing, access),
		},
		{
			provide: AttendanceOverrideUnit,
			inject: [
				HcmAccessDatabase,
				FieldCipher,
				WorkforceTimeContextBinder,
				WorkforceApprovalRoutingBinder,
				KyselyAttendanceWorkflowSourceBinder,
				WorkflowIntakeBinder,
				DocumentEvidenceBinder,
			],
			useFactory: /** Compose current-authority override storage with existing owner ports. */ (
				database: HcmAccessDatabase | null,
				cipher: FieldCipher,
				workforce: WorkforceTimeContextBinder,
				routing: WorkforceApprovalRoutingBinder,
				sources: KyselyAttendanceWorkflowSourceBinder,
				intake: WorkflowIntakeBinder,
				documents: DocumentEvidenceBinder,
			) =>
				new KyselyAttendanceOverrideUnit(
					database,
					cipher,
					workforce,
					routing,
					sources,
					intake,
					new KyselyLeaveWorkdayImpactBinder(),
					documents,
				),
		},
		{
			provide: AttendanceOverrides,
			inject: [AttendanceOverrideUnit],
			useFactory: /** Keep dated override commands in their application layer. */ (
				unit: AttendanceOverrideUnit,
			) => new AttendanceOverrides(unit),
		},
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
			) =>
				new KyselyDatedPublicationUnit(
					database,
					cipher,
					workforce,
					new KyselyLeaveWorkdayImpactBinder(),
				),
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
			) =>
				new KyselyWorkAssignmentUnit(
					database,
					cipher,
					workforce,
					subjects,
					new KyselyLeaveWorkdayImpactBinder(),
				),
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
			provide: AttendancePublishedWorkdayBinder,
			inject: [AttendanceConfigurationInputBinder],
			useFactory:
			/** Give approved consumers current immutable evidence through the Attendance owner. */ (
				inputs: AttendanceConfigurationInputBinder,
			) => new KyselyAttendancePublishedWorkdayBinder(inputs),
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
