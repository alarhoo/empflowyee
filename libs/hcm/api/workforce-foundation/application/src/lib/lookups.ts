import { randomUUID } from 'node:crypto'
import {
	LOOKUP_SETS,
	LOOKUP_SET_LABELS,
	isTenantLookupSet,
	parseLookupSetKey,
	parseLookupValueActive,
	parseLookupValueCreate,
	parseLookupValueQuery,
	parseLookupValueUpdate,
	type LookupSetDto,
	type LookupSetKey,
	type LookupValueCreate,
	type LookupValueDto,
	type LookupValueInput,
	type LookupValuePage,
	type LookupValueQuery,
	type TenantLookupSet,
} from '@empflowyee/hcm-workforce-foundation-contract'
import { HcmDomainError, idValue } from '@empflowyee/hcm-runtime-contract'
import {
	commandHash,
	runIdempotent,
	type AuthenticatedHcmContext,
} from '@empflowyee/hcm-api-runtime-application'
import { requireRevision } from '@empflowyee/hcm-api-workforce-foundation-domain'
import type { WorkforceUnitOfWork, WorkforceWork } from './structure'

/** Tenant and product lookup persistence bound to one authorized transaction. */
export interface LookupRepository {
	/** Active value counts per set. */
	counts(): Promise<Record<LookupSetKey, number>>
	/** One page of a set's values sorted by sort order, name and id. */
	values(set: LookupSetKey, query: LookupValueQuery): Promise<LookupValuePage>
	/** One value of a set, or undefined when absent or foreign. */
	value(set: LookupSetKey, id: string): Promise<LookupValueDto | undefined>
	/** Lock a tenant value and return its revision, or undefined when absent. */
	lockRevision(set: TenantLookupSet, id: string): Promise<number | undefined>
	/** Insert a tenant value with its immutable code. */
	create(id: string, command: LookupValueCreate): Promise<void>
	/** Update the mutable fields of a tenant value and advance its revision. */
	update(set: TenantLookupSet, id: string, value: LookupValueInput): Promise<void>
	/** Retire or reactivate a tenant value and advance its revision. */
	setActive(set: TenantLookupSet, id: string, active: boolean): Promise<void>
}

const READ = 'lookups.read'
const MANAGE = 'lookups.manage'
const targetType: Record<TenantLookupSet, string> = {
	'worker-types': 'worker-type',
	'employment-end-reasons': 'employment-end-reason',
	'worker-event-types': 'worker-event-type',
}

/** Lookup Values use cases: tenant sets are maintained, product sets are read-only. */
export class LookupValues {
	/** Bind the use cases to the workforce unit of work. */
	constructor(private readonly unit: WorkforceUnitOfWork) {}

	/** List the eight sets with ownership and active value counts. */
	sets(
		context: AuthenticatedHcmContext,
		params: URLSearchParams,
	): Promise<{ items: LookupSetDto[] }> {
		for (const key of params.keys())
			throw new HcmDomainError('invalid-request', [{ field: key, code: 'unknown' }])
		return this.unit.execute(
			context,
			READ,
			false,
			/** Count active values per set. */ async (w) => {
				const counts = await w.lookups.counts()
				return {
					items: LOOKUP_SETS.map(
						/** Project one set. */ (key) => ({
							key,
							label: LOOKUP_SET_LABELS[key],
							ownership: isTenantLookupSet(key) ? ('Tenant' as const) : ('Product' as const),
							itemCount: counts[key] ?? 0,
						}),
					),
				}
			},
		)
	}

	/** Read one page of a set's values. */
	values(
		context: AuthenticatedHcmContext,
		setKey: string,
		params: URLSearchParams,
	): Promise<LookupValuePage> {
		const set = parseLookupSetKey(setKey)
		const query = parseLookupValueQuery(params)
		return this.unit.execute(
			context,
			READ,
			false,
			/** Read only. */ (w) => w.lookups.values(set, query),
		)
	}

	/** Create a tenant value; 201 on success. */
	create(
		context: AuthenticatedHcmContext,
		setKey: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<LookupValueDto> {
		const command = parseLookupValueCreate(parseLookupSetKey(setKey), body)
		return this.command(
			context,
			`${command.set}.create`,
			'',
			command,
			key,
			/** Insert, audit and return the stored value. */ async (w) => {
				const id = randomUUID()
				await w.lookups.create(id, command)
				await this.audit(
					w,
					'workforce.lookup-created',
					command.set,
					id,
					requestId,
					command.reason,
					['code', ...Object.keys(command.value)],
				)
				return this.stored(w, command.set, id)
			},
		)
	}

	/** Update a tenant value's mutable fields at the expected revision. */
	update(
		context: AuthenticatedHcmContext,
		setKey: string,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<LookupValueDto> {
		const command = parseLookupValueUpdate(parseLookupSetKey(setKey), body)
		idValue(id, 'id')
		return this.command(
			context,
			`${command.set}.update`,
			id,
			command,
			key,
			/** Check revision, update and audit. */ async (w) => {
				const before = await this.locked(w, command.set, id, command.expectedRevision)
				await w.lookups.update(command.set, id, command.value)
				const changed = (Object.keys(command.value) as (keyof LookupValueInput)[]).filter(
					/** Name only fields whose value changed. */ (field) =>
						JSON.stringify(before[field]) !== JSON.stringify(command.value[field]),
				)
				await this.audit(
					w,
					'workforce.lookup-updated',
					command.set,
					id,
					requestId,
					command.reason,
					changed,
				)
				return this.stored(w, command.set, id)
			},
		)
	}

	/** Retire or reactivate a tenant value; retired values stay valid for existing references. */
	setActive(
		context: AuthenticatedHcmContext,
		setKey: string,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<LookupValueDto> {
		const command = parseLookupValueActive(parseLookupSetKey(setKey), body)
		idValue(id, 'id')
		return this.command(
			context,
			`${command.set}.active`,
			id,
			command,
			key,
			/** Check revision, toggle and audit. */ async (w) => {
				const before = await this.locked(w, command.set, id, command.expectedRevision)
				await w.lookups.setActive(command.set, id, command.active)
				await this.audit(
					w,
					command.active ? 'workforce.lookup-activated' : 'workforce.lookup-retired',
					command.set,
					id,
					requestId,
					command.reason,
					before.active === command.active ? [] : ['active'],
				)
				return this.stored(w, command.set, id)
			},
		)
	}

	/** Lock a value, require its revision and return its current state. */
	private async locked(
		w: WorkforceWork,
		set: TenantLookupSet,
		id: string,
		expected: number,
	): Promise<LookupValueDto> {
		const revision = await w.lookups.lockRevision(set, id)
		if (revision === undefined) throw new HcmDomainError('not-found')
		requireRevision(revision, expected)
		return this.stored(w, set, id)
	}

	/** Read the committed value inside the transaction. */
	private async stored(w: WorkforceWork, set: LookupSetKey, id: string): Promise<LookupValueDto> {
		const value = await w.lookups.value(set, id)
		if (!value) throw new HcmDomainError('not-found')
		return value
	}

	/** Append the audit event with IDs and changed field names only. */
	private audit(
		w: WorkforceWork,
		action: string,
		set: TenantLookupSet,
		id: string,
		requestId: string,
		reason: string,
		fields: string[],
	): Promise<string> {
		return w.audit.append({
			action,
			category: 'business',
			targetType: targetType[set],
			targetId: id,
			requestId,
			summary: { reason, changedFields: fields, fromState: null, toState: null },
		})
	}

	/** Serialize a lookup write and replay identical retries from the actor's receipt. */
	private command<T>(
		context: AuthenticatedHcmContext,
		operation: string,
		target: string,
		payload: unknown,
		key: string,
		work: (w: WorkforceWork) => Promise<T>,
	): Promise<T> {
		const hash = commandHash(target, payload)
		return this.unit.execute(
			context,
			MANAGE,
			true,
			/** Keep receipts in the business transaction. */ (w) =>
				runIdempotent(
					w.receipts,
					operation,
					key,
					hash,
					/** Run the business change once. */ () => work(w),
				),
		)
	}
}
