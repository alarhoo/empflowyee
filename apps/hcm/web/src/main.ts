import './ui5-init'
import { bootstrapWithRuntimeConfig } from '@empflowyee/platform-web-runtime-shell'
import { appConfig } from './app/app.config'
import { App } from './app/app'
import { parseHcmBrowserRuntimeConfig } from '@empflowyee/hcm-web-runtime-context'

void bootstrapWithRuntimeConfig(App, appConfig, parseHcmBrowserRuntimeConfig)
