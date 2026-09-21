import { ConsoleLogger, Controller, Get, Module, RequestMethod, Type } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { parseNodeRuntimeConfig } from '@empflowyee/platform-runtime-contract'

@Controller('health')
export class RuntimeHealthController {
	/** Report process responsiveness without calling databases or external providers. */
	@Get('live')
	live() {
		return { status: 'ok' }
	}

	/** Report readiness after bootstrap validation; current scaffold apps have no required external dependencies. */
	@Get('ready')
	ready() {
		return { status: 'ready' }
	}
}

@Module({ controllers: [RuntimeHealthController] })
export class RuntimeModule {}

/** Validate configuration before creating Nest, preserve API routes and enable Cloud Run shutdown behavior. */
export async function bootstrapApi(rootModule: Type<unknown>, localPort: number): Promise<void> {
	const config = parseNodeRuntimeConfig(process.env, localPort)
	const logger = new ConsoleLogger({ json: true })
	const app = await NestFactory.create(rootModule, { logger })
	app.setGlobalPrefix('api', {
		exclude: [
			{ path: 'health/live', method: RequestMethod.GET },
			{ path: 'health/ready', method: RequestMethod.GET },
		],
	})
	app.enableShutdownHooks()
	await app.listen(config.port, '0.0.0.0')
	logger.log({ message: 'Application ready', ...config }, 'Bootstrap')
}

/** Record a sanitized startup failure and terminate rather than leaving an unhealthy process running. */
export function reportBootstrapFailure(): never {
	new ConsoleLogger({ json: true }).error(
		'Application startup failed; verify runtime configuration',
		'Bootstrap',
	)
	process.exit(1)
}
