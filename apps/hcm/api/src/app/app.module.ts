import { HcmAuditModule } from '@empflowyee/hcm-api-audit-module'
import { HcmIdentityAccessModule } from '@empflowyee/hcm-api-identity-access-module'
import { HcmAccessControlModule } from '@empflowyee/hcm-api-access-control-module'
import { Module } from '@nestjs/common'
import { RuntimeModule } from '@empflowyee/platform-api-runtime-module'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'

@Module({
	imports: [
		HcmAuditModule,
		RuntimeModule,
		HcmRuntimeModule,
		HcmAccessControlModule,
		HcmIdentityAccessModule,
	],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
