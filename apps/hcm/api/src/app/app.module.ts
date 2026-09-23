import { Module } from '@nestjs/common'
import { RuntimeModule } from '@empflowyee/platform-api-runtime-module'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'

@Module({
	imports: [RuntimeModule, HcmRuntimeModule],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
