import { Module } from '@nestjs/common'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'
import { FieldCipher } from '@empflowyee/hcm-api-runtime-application'
import { HcmAccessControlModule } from '@empflowyee/hcm-api-access-control-module'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import {
	AttendanceScheduleUnitOfWork,
	AttendanceScheduleDrafts,
	AttendanceScheduleQueries,
	AttendanceTemplatePublication,
} from '@empflowyee/hcm-api-attendance-application'
import { KyselyAttendanceScheduleUnit } from '@empflowyee/hcm-api-attendance-infrastructure'
import { ScheduleTemplatesController } from '@empflowyee/hcm-api-attendance-transport'

/** Attendance composition owns no scheduler loop or startup migration. */
@Module({
	imports: [HcmRuntimeModule, HcmAccessControlModule],
	controllers: [ScheduleTemplatesController],
	providers: [
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
