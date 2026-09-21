import { bootstrapApi, reportBootstrapFailure } from '@empflowyee/platform-api-runtime-module'
import { AppModule } from './app/app.module'

void bootstrapApi(AppModule, 4401).catch(reportBootstrapFailure)
