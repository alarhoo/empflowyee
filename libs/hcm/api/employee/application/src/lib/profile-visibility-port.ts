import type {
	ProfileFieldDto,
	ProfileFieldRef,
	ProfileVisibility,
	ViewerRelation,
} from '@empflowyee/hcm-employee-contract'
import { effectiveVisibility, relationSees } from '@empflowyee/hcm-api-employee-domain'

/** One current worker visibility preference. */
export interface ProfilePreferenceRow {
	workerId: string
	ref: ProfileFieldRef
	visibility: ProfileVisibility
}

/** Employee-owned policy reads bound to one authorized transaction. */
export interface ProfilePolicyReader {
	/** Standard and custom fields with ceiling, product default and current tenant policy. */
	catalogue(): Promise<ProfileFieldDto[]>
	/** Current visibility preferences of the given workers. */
	preferences(workerIds: readonly string[]): Promise<ProfilePreferenceRow[]>
}

/**
 * Field visibility for a viewer relation (TDD-HCM-2-COMMON#auth). Row authorization happens first;
 * this port only decides which fields of an authorized row may be serialized. A field outside the
 * allowlist is omitted, never returned as null.
 */
export interface ProfileFieldVisibilityPort {
	/** Fields visible to a relation before any worker preference; for listing columns and search. */
	baseline(relation: ViewerRelation): Promise<ReadonlySet<ProfileFieldRef>>
	/** Fields each worker exposes to a relation after tenant policy and allowed preferences. */
	visibleFields(
		relation: ViewerRelation,
		workerIds: readonly string[],
	): Promise<Map<string, ReadonlySet<ProfileFieldRef>>>
	/** Effective visibility of every field for one worker, or for no worker (baseline); null is hidden. */
	effective(workerId: string | null): Promise<Map<ProfileFieldRef, ProfileVisibility | null>>
	/** Fields searchable for a relation: searchable when visible, and visible to the relation. */
	searchable(relation: ViewerRelation): Promise<ReadonlySet<ProfileFieldRef>>
}

/** Evaluate the policy once per bound transaction over the employee-owned policy rows. */
export class PolicyProfileFieldVisibility implements ProfileFieldVisibilityPort {
	private fields?: Promise<ProfileFieldDto[]>

	/** Read policy through the transaction-bound reader. */
	constructor(private readonly reader: ProfilePolicyReader) {}

	/** Load the active catalogue once per request. */
	private catalogue(): Promise<ProfileFieldDto[]> {
		this.fields ??= this.reader
			.catalogue()
			.then(
				/** Inactive fields are visible to nobody. */ (all) =>
					all.filter(/** Active only. */ (field) => field.active),
			)
		return this.fields
	}

	/** Effective visibility of one field with an optional preference. */
	private visibility(field: ProfileFieldDto, preference: ProfileVisibility | null) {
		return effectiveVisibility({
			ceiling: field.ceiling,
			productDefault: field.productDefault,
			tenantPolicy: field.tenantPolicy,
			preference,
		})
	}

	/** Fields visible to a relation before any worker preference. */
	async baseline(relation: ViewerRelation): Promise<ReadonlySet<ProfileFieldRef>> {
		const visible = new Set<ProfileFieldRef>()
		for (const field of await this.catalogue()) {
			const visibility = this.visibility(field, null)
			if (visibility && relationSees(relation, visibility)) visible.add(field.ref)
		}
		return visible
	}

	/** Fields each worker exposes to a relation. */
	async visibleFields(
		relation: ViewerRelation,
		workerIds: readonly string[],
	): Promise<Map<string, ReadonlySet<ProfileFieldRef>>> {
		const fields = await this.catalogue()
		const preferences = new Map<string, Map<ProfileFieldRef, ProfileVisibility>>()
		for (const row of await this.reader.preferences(workerIds)) {
			const worker = preferences.get(row.workerId) ?? new Map()
			worker.set(row.ref, row.visibility)
			preferences.set(row.workerId, worker)
		}
		const result = new Map<string, ReadonlySet<ProfileFieldRef>>()
		for (const workerId of workerIds) {
			const own = preferences.get(workerId)
			const visible = new Set<ProfileFieldRef>()
			for (const field of fields) {
				const visibility = this.visibility(field, own?.get(field.ref) ?? null)
				if (visibility && relationSees(relation, visibility)) visible.add(field.ref)
			}
			result.set(workerId, visible)
		}
		return result
	}

	/** Effective visibility of every field for one worker. */
	async effective(
		workerId: string | null,
	): Promise<Map<ProfileFieldRef, ProfileVisibility | null>> {
		const own = new Map<ProfileFieldRef, ProfileVisibility>()
		if (workerId)
			for (const row of await this.reader.preferences([workerId])) own.set(row.ref, row.visibility)
		return new Map(
			(await this.catalogue()).map(
				/** One field. */ (field) => [
					field.ref,
					this.visibility(field, own.get(field.ref) ?? null),
				],
			),
		)
	}

	/** Fields searchable for a relation. */
	async searchable(relation: ViewerRelation): Promise<ReadonlySet<ProfileFieldRef>> {
		const visible = await this.baseline(relation)
		return new Set(
			(await this.catalogue())
				.filter(
					/** Searchable and visible. */ (field) => field.searchable && visible.has(field.ref),
				)
				.map(/** Reference. */ (field) => field.ref),
		)
	}
}
