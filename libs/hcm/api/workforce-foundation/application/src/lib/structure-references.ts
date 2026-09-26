import type { HcmListQuery, HcmPage } from '@empflowyee/hcm-runtime-contract'
import type { StructureOption } from '@empflowyee/hcm-workforce-foundation-contract'

/** Structure kinds other domains may reference in their own records. */
export type StructureReferenceKind =
	| 'legal-entities'
	| 'units'
	| 'departments'
	| 'designations'
	| 'locations'

/** Structure options, reference checks and labels for other domains (TDD-HCM-2-COMMON#ports). */
export interface StructureReferencePort {
	/** One page of options of a kind on a date, matched by code or name. */
	options(
		kind: StructureReferenceKind,
		query: HcmListQuery & { activeOnly: boolean },
		asOf: string,
	): Promise<HcmPage<StructureOption>>
	/** Require an existing, active reference effective on a date, reported against the named field. */
	requireReference(
		kind: StructureReferenceKind,
		id: string,
		field: string,
		asOf: string,
	): Promise<void>
	/** Code and name of the given ids on a date; unknown ids are absent. */
	labels(
		kind: StructureReferenceKind,
		ids: readonly string[],
		asOf: string,
	): Promise<Map<string, StructureOption>>
}
