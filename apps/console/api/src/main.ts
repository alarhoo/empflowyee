/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app/app.module'

/** Start the console Nest application under /api, using PORT or its local fallback; reject if startup fails. */
async function bootstrap() {
	const app = await NestFactory.create(AppModule)
	const globalPrefix = 'api'
	app.setGlobalPrefix(globalPrefix)
	const port = process.env.PORT || 4401
	await app.listen(port)
	Logger.log(`🚀 Application is running on: http://localhost:${port}/${globalPrefix}`)
}

bootstrap().catch(
	/** Log the startup failure and mark the process unsuccessful for the runtime supervisor. */ (
		error: unknown,
	) => {
		Logger.error(error, 'Bootstrap')
		process.exitCode = 1
	},
)
