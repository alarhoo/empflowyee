import { Module } from '@nestjs/common'
import {
	HcmRuntimeApplication,
	HcmSessionReader,
	TenantDirectory,
} from '@empflowyee/hcm-api-runtime-application'
import {
	createSessionReader,
	createTenantDirectory,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import {
	HcmRequestTenantContext,
	HcmRuntimeController,
} from '@empflowyee/hcm-api-runtime-transport'

@Module({
	controllers: [HcmRuntimeController],
	providers: [
		{
			provide: TenantDirectory,
			useFactory: /** Select only the explicitly opted-in local discovery adapter. */ () =>
				createTenantDirectory(process.env),
		},
		{
			provide: HcmSessionReader,
			useFactory: /** Keep local session activation at the server composition boundary. */ () =>
				createSessionReader(process.env),
		},
		{
			provide: HcmRuntimeApplication,
			inject: [TenantDirectory, HcmSessionReader],
			useFactory: /** Compose ports without introducing Nest into the application layer. */ (
				tenants: TenantDirectory,
				sessions: HcmSessionReader,
			) => new HcmRuntimeApplication(tenants, sessions),
		},
		HcmRequestTenantContext,
	],
	exports: [HcmRequestTenantContext, HcmRuntimeApplication],
})
export class HcmRuntimeModule {}
