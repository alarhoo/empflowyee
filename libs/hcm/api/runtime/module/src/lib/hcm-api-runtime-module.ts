import { Module } from '@nestjs/common'
import {
	FieldCipher,
	HcmRuntimeApplication,
	HcmSessionReader,
	TenantDirectory,
} from '@empflowyee/hcm-api-runtime-application'
import {
	createFieldCipher,
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
		{
			provide: FieldCipher,
			useFactory: /** Field encryption with the environment's key hierarchy. */ () =>
				createFieldCipher(process.env),
		},
		HcmRequestTenantContext,
	],
	exports: [HcmRequestTenantContext, HcmRuntimeApplication, FieldCipher],
})
export class HcmRuntimeModule {}
