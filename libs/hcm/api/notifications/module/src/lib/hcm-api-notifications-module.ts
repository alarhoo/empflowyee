import { Module } from '@nestjs/common'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'
import { HcmAccessControlModule } from '@empflowyee/hcm-api-access-control-module'
import { HcmAccessDatabase } from '@empflowyee/hcm-api-access-control-infrastructure'
import {
	Notifications,
	NotificationUnitOfWork,
} from '@empflowyee/hcm-api-notifications-application'
import { KyselyNotificationUnitOfWork } from '@empflowyee/hcm-api-notifications-infrastructure'
import {
	NotificationSelfController,
	NotificationConfigurationController,
} from '@empflowyee/hcm-api-notifications-transport'
@Module({
	imports: [HcmRuntimeModule, HcmAccessControlModule],
	controllers: [NotificationSelfController, NotificationConfigurationController],
	providers: [
		{
			provide: NotificationUnitOfWork,
			inject: [HcmAccessDatabase],
			useFactory: /** Bind the notification-owned adapters to existing authorized transactions. */ (
				database: HcmAccessDatabase | null,
			) => new KyselyNotificationUnitOfWork(database),
		},
		{
			provide: Notifications,
			inject: [NotificationUnitOfWork],
			useFactory: /** Compose persistence-neutral own-account use cases. */ (
				unit: NotificationUnitOfWork,
			) => new Notifications(unit),
		},
	],
})
export class HcmNotificationsModule {}
