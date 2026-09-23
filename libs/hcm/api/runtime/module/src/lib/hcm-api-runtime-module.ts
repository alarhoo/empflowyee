import { Module } from '@nestjs/common'
import {
	HcmRuntimeApplication,
	HcmSessionReader,
	TenantDirectory,
} from '@empflowyee/hcm-api-runtime-application'
import {
	createSessionReader,
	createTenantDirectory,
	createRuntimeStore,
	HcmRuntimeStore,
} from '@empflowyee/hcm-api-runtime-infrastructure'
import {
	HcmRequestTenantContext,
	HcmRuntimeController,
} from '@empflowyee/hcm-api-runtime-transport'

@Module({
	controllers: [HcmRuntimeController],
	providers: [
		{
			provide: HcmRuntimeStore,
			useFactory: /** Own one database pool and its Nest shutdown lifecycle. */ () =>
				createRuntimeStore(process.env),
		},
		{
			provide: TenantDirectory,
			inject: [HcmRuntimeStore],
			useFactory: /** Select only the explicitly opted-in persisted discovery adapter. */ (
				store: HcmRuntimeStore | null,
			) => createTenantDirectory(process.env, store),
		},
		{
			provide: HcmSessionReader,
			inject: [HcmRuntimeStore],
			useFactory: /** Bind persisted development sessions. */ (store: HcmRuntimeStore | null) =>
				createSessionReader(process.env, store),
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
