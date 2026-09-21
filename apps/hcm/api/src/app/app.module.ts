import { Module } from '@nestjs/common'
import { RuntimeModule } from '@empflowyee/platform-api-runtime-module'
import { AppController } from './app.controller'
import { AppService } from './app.service'

@Module({
	imports: [RuntimeModule],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
