import {
	Controller,
	Get,
	Inject,
	Injectable,
	Scope,
	HttpException,
	Logger,
	Res,
} from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { randomUUID } from 'node:crypto'
import {
	HcmRuntimeApplication,
	HcmRuntimeError,
	type TenantRecord,
} from '@empflowyee/hcm-api-runtime-application'
import type {
	HcmRuntimeContext,
	TenantDiscoveryResponse,
	RuntimeFailureCode,
} from '@empflowyee/hcm-runtime-contract'

interface RuntimeRequest {
	headers: {
		host?: string
		cookie?: string
		'x-request-id'?: string
		'x-hcm-development-persona'?: string
	}
	socket: { remoteAddress?: string }
}
interface RuntimeResponse {
	setHeader(name: string, value: string): void
}

@Injectable({ scope: Scope.REQUEST })
export class HcmRequestTenantContext {
	private tenant?: Promise<TenantRecord>
	readonly requestId: string
	/** Capture request authority once; downstream application calls share the same tenant promise. */
	constructor(
		@Inject(REQUEST) private readonly request: RuntimeRequest,
		@Inject(HcmRuntimeApplication) private readonly runtime: HcmRuntimeApplication,
	) {
		const supplied = request.headers['x-request-id']
		this.requestId =
			typeof supplied === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(supplied)
				? supplied
				: randomUUID()
	}
	/** Resolve only the preserved Host header; arbitrary Forwarded/X-Forwarded-Host are never trusted. */
	resolve(): Promise<TenantRecord> {
		this.tenant ??= this.runtime.resolveTenant(
			this.request.headers.host,
			this.request.socket.remoteAddress,
		)
		return this.tenant
	}
	/** Pass the opaque cookie to the verified session port after tenant authority is established. */
	async session(): Promise<HcmRuntimeContext> {
		return this.runtime.session(await this.resolve(), this.request.headers.cookie, {
			peerAddress: this.request.socket.remoteAddress,
			developmentPersona: this.request.headers['x-hcm-development-persona'],
		})
	}
}

@Controller('v1/runtime')
export class HcmRuntimeController {
	private readonly logger = new Logger(HcmRuntimeController.name)
	/** Inject the request-scoped tenant context and framework-neutral runtime use cases. */
	constructor(
		@Inject(HcmRequestTenantContext) private readonly context: HcmRequestTenantContext,
		@Inject(HcmRuntimeApplication) private readonly runtime: HcmRuntimeApplication,
	) {}

	/** Expose only safe pre-auth presentation data for the authoritative request tenant. */
	@Get('tenant')
	async tenant(
		@Res({ passthrough: true }) response: RuntimeResponse,
	): Promise<TenantDiscoveryResponse> {
		this.headers(response)
		try {
			return this.runtime.discover(await this.context.resolve())
		} catch (error) {
			throw this.failure(error)
		}
	}

	/** Require authenticated membership independently of every browser navigation check. */
	@Get('session')
	async session(@Res({ passthrough: true }) response: RuntimeResponse): Promise<HcmRuntimeContext> {
		this.headers(response)
		try {
			return await this.context.session()
		} catch (error) {
			throw this.failure(error)
		}
	}

	/** Prevent tenant/session responses from entering shared caches and return the correlation identifier. */
	private headers(response: RuntimeResponse): void {
		response.setHeader('Cache-Control', 'no-store')
		response.setHeader('X-Request-ID', this.context.requestId)
	}

	/** Map safe classifications to distinct HTTP statuses without logging credentials or employee payloads. */
	private failure(error: unknown): HttpException {
		const code: RuntimeFailureCode =
			error instanceof HcmRuntimeError ? error.code : 'runtime-unavailable'
		const statuses = {
			'tenant-not-found': 404,
			'tenant-suspended': 423,
			unauthenticated: 401,
			forbidden: 403,
			'runtime-unavailable': 503,
		}
		if (code === 'runtime-unavailable')
			this.logger.error({ code, requestId: this.context.requestId })
		return new HttpException({ code, requestId: this.context.requestId }, statuses[code])
	}
}
