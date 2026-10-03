import type { Kysely } from 'kysely'
import type { DatedConfigurationFamily } from '@empflowyee/hcm-attendance-contract'
import type { DatedConfigurationVersion } from '@empflowyee/hcm-api-attendance-application'
import { KyselyScheduleRepository } from './schedule-repository'
import { KyselyWorkConfigurationRepository } from './work-configuration-repository'

/** Compose exact schedule/shift repositories without exposing policies or template mutation through this lifecycle. */
export class KyselyDatedSource {
	private readonly schedules: KyselyScheduleRepository
	private readonly shifts: KyselyWorkConfigurationRepository
	/** Bind every repository to the same source-authorized transaction; worker reads never use list authority. */
	constructor(
		transaction: Kysely<unknown>,
		tenant: string,
		actor: string,
		private readonly family: DatedConfigurationFamily,
	) {
		this.schedules = new KyselyScheduleRepository(transaction, tenant, actor)
		this.shifts = new KyselyWorkConfigurationRepository(transaction, tenant, actor, '', 'Shift')
	}
	/** Read a purpose-built exact source projection, retaining no persistence metadata. */
	async read(id: string, version: string): Promise<DatedConfigurationVersion | null> {
		const result =
			this.family === 'Schedule'
				? await this.schedules.read(id, version)
				: await this.shifts.read(id, version)
		return result && !('approvalRules' in result) ? result : null
	}
	/** Lock only the selected source family before mutation. */
	async lock(id: string, version: string): Promise<DatedConfigurationVersion | null> {
		const result =
			this.family === 'Schedule'
				? await this.schedules.lock(id, version)
				: await this.shifts.lock(id, version)
		return result && !('approvalRules' in result) ? result : null
	}
	/** Freeze the exact Draft after dated source evidence was consumed. */
	publish(id: string, version: string, revision: number, digest: string): Promise<void> {
		return this.family === 'Schedule'
			? this.schedules.publish(id, version, revision, digest)
			: this.shifts.publish(id, version, revision, digest)
	}
	/** Retain immutable contents while withdrawing this version from future selection. */
	retire(id: string, version: string, revision: number): Promise<void> {
		return this.family === 'Schedule'
			? this.schedules.retire(id, version, revision)
			: this.shifts.retire(id, version, revision)
	}
}
