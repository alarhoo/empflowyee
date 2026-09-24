import { Module } from '@nestjs/common'
import { HcmRuntimeModule } from '@empflowyee/hcm-api-runtime-module'
import { assertLocalRuntime } from '@empflowyee/hcm-api-runtime-infrastructure'
import { RoleManagement, RoleUnitOfWork } from '@empflowyee/hcm-api-access-control-application'
import {
	HcmAccessDatabase,
	KyselyRoleUnitOfWork,
} from '@empflowyee/hcm-api-access-control-infrastructure'
import {
	RoleManagementController,
	HCM_ROLE_WRITE_ORIGIN,
} from '@empflowyee/hcm-api-access-control-transport'

class UnconfiguredRoleUnitOfWork extends RoleUnitOfWork {
	/** Never expose database work outside the opted-in local runtime. */
	async execute<T>(): Promise<T> {
		throw new Error('Business runtime is unavailable')
	}
}
/** Compose business persistence only inside the existing local development trust boundary. */
function accessDatabase(): HcmAccessDatabase | null {
	if (process.env['HCM_LOCAL_TENANTS'] !== 'true' || process.env['HCM_LOCAL_SESSION'] !== 'true')
		return null
	assertLocalRuntime(process.env)
	const connection = process.env['HCM_DATABASE_URL']
	if (!connection) throw new Error('Persistent HCM database configuration required')
	const url = new URL(connection)
	if (
		!['postgres:', 'postgresql:'].includes(url.protocol) ||
		!['127.0.0.1', '[::1]'].includes(url.hostname) ||
		url.username !== 'hcm_runtime' ||
		url.pathname !== '/hcm_db' ||
		!url.password ||
		url.search ||
		url.hash
	)
		throw new Error('Unsafe local business database configuration')
	return new HcmAccessDatabase(connection)
}
/** Validate the exact configured browser origin once; missing configuration keeps writes disabled. */
function writeOrigin(): string | null {
	const value = process.env['HCM_LOCAL_WRITE_ORIGIN']
	if (!value) return null
	assertLocalRuntime(process.env)
	const url = new URL(value)
	if (
		url.origin !== value ||
		!['http:', 'https:'].includes(url.protocol) ||
		!(
			url.hostname.endsWith('.localhost') ||
			['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
		)
	)
		throw new Error('Local write origin must be an exact loopback browser origin')
	return value
}
@Module({
	imports: [HcmRuntimeModule],
	controllers: [RoleManagementController],
	providers: [
		{ provide: HcmAccessDatabase, useFactory: accessDatabase },
		{
			provide: RoleUnitOfWork,
			inject: [HcmAccessDatabase],
			useFactory: /** Bind application ports without importing persistence into use cases. */ (
				database: HcmAccessDatabase | null,
			) => (database ? new KyselyRoleUnitOfWork(database) : new UnconfiguredRoleUnitOfWork()),
		},
		{
			provide: RoleManagement,
			inject: [RoleUnitOfWork],
			useFactory: /** Construct the framework-independent role use cases. */ (
				unit: RoleUnitOfWork,
			) => new RoleManagement(unit),
		},
		{ provide: HCM_ROLE_WRITE_ORIGIN, useFactory: writeOrigin },
	],
})
export class HcmAccessControlModule {}
