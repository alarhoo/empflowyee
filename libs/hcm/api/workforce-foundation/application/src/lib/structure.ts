import { randomUUID } from 'node:crypto'
import {
	parseOptionQuery,
	parseOrganisationProfileUpdate,
	parseStructureActive,
	parseStructureArea,
	parseStructureCreate,
	parseStructureListQuery,
	parseStructureOptionKind,
	parseStructureUpdate,
	parseUnitRetire,
	parseUnitVersion,
	type OrganisationProfileUpdate,
	type OrganisationProfileView,
	type StructureArea,
	type StructureCreate,
	type StructureItemDto,
	type StructureListQuery,
	type StructureOption,
	type StructureOptionKind,
	type StructurePage,
	type StructureUpdate,
	type UnitDetailDto,
	type UnitVersionInput,
} from '@empflowyee/hcm-workforce-foundation-contract'
import {
	HcmDomainError,
	dateValue,
	idValue,
	type HcmListQuery,
	type HcmPage,
} from '@empflowyee/hcm-runtime-contract'
import {
	requireNoCycle,
	requireRevision,
	requireUnitPlacement,
	retirementDate,
	successorWindow,
	type UnitTypeRule,
} from '@empflowyee/hcm-api-workforce-foundation-domain'
import {
	commandHash,
	runIdempotent,
	type AuthenticatedHcmContext,
	type CommandReceiptStore,
} from '@empflowyee/hcm-api-runtime-application'
import type { AppendAudit } from '@empflowyee/hcm-api-audit-application'
import type { IdentificationTypeRepository } from './identification-types'
import type { WorkforceFactsPort, WorkforceReadPort } from './workforce-ports'

export interface UnitVersionRow {
	id: string
	unitId: string
	unitTypeId: string
	parentId: string | null
	effectiveFrom: string
	effectiveTo: string | null
}
export type HierarchyArea = 'units' | 'departments' | 'designations'
export type ReferenceKind = StructureOptionKind

/** Tenant-scoped structure persistence; every method runs in the caller's authorized transaction. */
export interface StructureRepository {
	/** Read the Account-owned display name and the HCM organisation profile, if configured. */
	profile(): Promise<OrganisationProfileView>
	/** Insert the first profile (expected revision 0) or update the current revision. */
	saveProfile(value: OrganisationProfileUpdate): Promise<void>
	/** Read one bounded page of an area; units are read at an as-of date. */
	list(query: StructureListQuery, asOf: string): Promise<StructurePage>
	/** Read one item; units include versions and usage at the as-of date. */
	detail(area: StructureArea, id: string, asOf: string): Promise<StructureItemDto | UnitDetailDto>
	/** Read one bounded picker page. */
	options(
		kind: StructureOptionKind,
		query: HcmListQuery & { activeOnly: boolean },
		asOf: string,
	): Promise<HcmPage<StructureOption>>
	/** Require an existing active reference, reported against the named field. */
	requireReference(kind: ReferenceKind, id: string, field: string, asOf: string): Promise<void>
	/** Lock one item and return its current revision. */
	lockRevision(area: StructureArea, id: string): Promise<number>
	/** Read the type-chain rule for a unit type. */
	unitType(id: string): Promise<UnitTypeRule & { hierarchyLevel: number }>
	/** Read the unit version effective on a date. */
	unitVersionAt(unitId: string, date: string): Promise<UnitVersionRow | null>
	/** Read the most recent version of a unit. */
	latestUnitVersion(unitId: string): Promise<UnitVersionRow>
	/** Return the item and its ancestors, nearest first, bounded to twenty levels. */
	ancestors(area: HierarchyArea, id: string, asOf: string): Promise<string[]>
	/** Report whether another unit of the type already has the parent at the date. */
	siblingOfTypeExists(
		parentId: string,
		unitTypeId: string,
		date: string,
		excludeUnitId: string | null,
	): Promise<boolean>
	/** Report whether current or future records still depend on an item from the date. */
	inUse(area: StructureArea, id: string, from: string): Promise<boolean>
	/** Insert a new item; units also insert their first version. */
	create(id: string, command: StructureCreate, hierarchyLevel: number | null): Promise<void>
	/** Update mutable fields of a non-unit item and advance its revision. */
	update(area: Exclude<StructureArea, 'units'>, id: string, command: StructureUpdate): Promise<void>
	/** Retire or reactivate a non-unit item and advance its revision. */
	setActive(area: Exclude<StructureArea, 'units'>, id: string, active: boolean): Promise<void>
	/** Close the latest unit version and open a successor version. */
	addUnitVersion(unitId: string, input: UnitVersionInput, closeLatestOn: string): Promise<void>
	/** Close the latest unit version, deactivate the unit and record a successor. */
	retireUnit(unitId: string, effectiveTo: string, successorId: string | null): Promise<void>
}

export interface WorkforceWork {
	structure: StructureRepository
	identification: IdentificationTypeRepository
	/** Workforce commands bound to this transaction. */
	facts: WorkforceFactsPort
	/** Workforce as-of projections bound to this transaction. */
	reads: WorkforceReadPort
	receipts: CommandReceiptStore
	audit: AppendAudit
	/** Today's business date in the organisation time zone. */
	today: string
}

export abstract class WorkforceUnitOfWork {
	/** Reauthorize the workforce permission and bind repositories to one tenant transaction. */
	abstract execute<T>(
		context: AuthenticatedHcmContext,
		permission: string,
		write: boolean,
		work: (scope: WorkforceWork) => Promise<T>,
	): Promise<T>
}

const singular: Record<StructureArea, string> = {
	'legal-entities': 'legal-entity',
	'unit-types': 'organisation-unit-type',
	units: 'organisation-unit',
	departments: 'department',
	designations: 'designation',
	locations: 'location',
}

/** Organisation structure use cases; Organization Structure is the only HCM writer (DEC-HCM2-014). */
export class OrganisationStructure {
	/** Bind structure use cases to the workforce unit of work. */
	constructor(private readonly unit: WorkforceUnitOfWork) {}

	/** Read organisation HR defaults and the Account-owned display name. */
	profile(context: AuthenticatedHcmContext): Promise<OrganisationProfileView> {
		return this.unit.execute(
			context,
			'structure.read',
			false,
			/** Read only. */ (w) => w.structure.profile(),
		)
	}

	/** Create or update organisation HR defaults under the current revision. */
	saveProfile(
		context: AuthenticatedHcmContext,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<OrganisationProfileView> {
		const value = parseOrganisationProfileUpdate(body)
		return this.command(
			context,
			'profile.save',
			'',
			value,
			key,
			/** Validate references then persist. */ async (w) => {
				const before = await w.structure.profile()
				const current = before.profile?.revision ?? 0
				if (current !== value.expectedRevision) throw new HcmDomainError('revision-conflict')
				await w.structure.requireReference(
					'currencies',
					value.defaultCurrencyCode,
					'defaultCurrencyCode',
					w.today,
				)
				if (value.headquartersLocationId)
					await w.structure.requireReference(
						'locations',
						value.headquartersLocationId,
						'headquartersLocationId',
						w.today,
					)
				await w.structure.saveProfile(value)
				const prior = before.profile
				const comparisons: [string, boolean][] = [
					['defaultTimeZone', prior?.defaultTimeZone !== value.defaultTimeZone],
					['defaultLanguage', prior?.defaultLanguage !== value.defaultLanguage],
					['defaultCurrencyCode', prior?.defaultCurrency.code !== value.defaultCurrencyCode],
					[
						'financialYearStartMonth',
						prior?.financialYearStartMonth !== value.financialYearStartMonth,
					],
					['financialYearStartDay', prior?.financialYearStartDay !== value.financialYearStartDay],
					[
						'headquartersLocationId',
						(prior?.headquartersLocation?.id ?? null) !== value.headquartersLocationId || !prior,
					],
				]
				const changed: string[] = []
				for (const [field, differs] of comparisons) if (differs) changed.push(field)
				await w.audit.append({
					action: 'workforce.profile-updated',
					category: 'business',
					targetType: 'organisation-profile',
					targetId: 'organisation-profile',
					requestId,
					summary: {
						reason: value.reason,
						changedFields: changed,
						fromState: null,
						toState: null,
					},
				})
				return w.structure.profile()
			},
		)
	}

	/** List one structure area; units default to today's effective hierarchy. */
	list(
		context: AuthenticatedHcmContext,
		area: string,
		params: URLSearchParams,
	): Promise<StructurePage> {
		const query = parseStructureListQuery(parseStructureArea(area), params)
		return this.unit.execute(
			context,
			'structure.read',
			false,
			/** Read one page. */ (w) => w.structure.list(query, query.asOf ?? w.today),
		)
	}

	/** Read one structure item. */
	detail(
		context: AuthenticatedHcmContext,
		area: string,
		id: string,
		params: URLSearchParams,
	): Promise<StructureItemDto | UnitDetailDto> {
		const parsed = parseStructureArea(area)
		idValue(id, 'id')
		const asOf = params.get('asOf')
		for (const key of params.keys())
			if (key !== 'asOf' || params.getAll(key).length !== 1)
				throw new HcmDomainError('invalid-request')
		const date = asOf === null ? null : dateValue(asOf, 'asOf')
		return this.unit.execute(
			context,
			'structure.read',
			false,
			/** Read one item. */ (w) => w.structure.detail(parsed, id, date ?? w.today),
		)
	}

	/** Read bounded picker options for structure editing. */
	options(
		context: AuthenticatedHcmContext,
		kind: string,
		params: URLSearchParams,
	): Promise<HcmPage<StructureOption>> {
		const parsed = parseStructureOptionKind(kind)
		const query = parseOptionQuery(params)
		return this.unit.execute(
			context,
			'structure.manage',
			false,
			/** Read options. */ (w) => w.structure.options(parsed, query, w.today),
		)
	}

	/** Create one structure item with an immutable code. */
	create(
		context: AuthenticatedHcmContext,
		area: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<StructureItemDto | UnitDetailDto> {
		const command = parseStructureCreate(parseStructureArea(area), body)
		return this.command(
			context,
			`${command.area}.create`,
			'',
			command,
			key,
			/** Validate, insert and audit. */ async (w) => {
				const level = await this.validateCreate(w, command)
				const id = randomUUID()
				await w.structure.create(id, command, level)
				await this.audit(
					w,
					'workforce.structure-created',
					command.area,
					id,
					requestId,
					command.reason,
					Object.keys(command.value),
				)
				return w.structure.detail(
					command.area,
					id,
					command.area === 'units' ? command.value.effectiveFrom : w.today,
				)
			},
		)
	}

	/** Update mutable fields of one non-unit item under its current revision. */
	update(
		context: AuthenticatedHcmContext,
		area: string,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<StructureItemDto | UnitDetailDto> {
		idValue(id, 'id')
		const command = parseStructureUpdate(parseStructureArea(area), body)
		return this.command(
			context,
			`${command.area}.update`,
			id,
			command,
			key,
			/** Validate, update and audit. */ async (w) => {
				requireRevision(await w.structure.lockRevision(command.area, id), command.expectedRevision)
				await this.validateUpdate(w, id, command)
				if (
					command.area === 'legal-entities' &&
					command.value.operationsClosedOn !== null &&
					(await w.structure.inUse(command.area, id, command.value.operationsClosedOn))
				)
					throw new HcmDomainError('structure-in-use')
				await w.structure.update(command.area, id, command)
				await this.audit(
					w,
					'workforce.structure-updated',
					command.area,
					id,
					requestId,
					command.reason,
					Object.keys(command.value),
				)
				return w.structure.detail(command.area, id, w.today)
			},
		)
	}

	/** Retire or reactivate one non-unit item; retirement is blocked while the item is in use. */
	setActive(
		context: AuthenticatedHcmContext,
		area: string,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<StructureItemDto | UnitDetailDto> {
		const parsed = parseStructureArea(area)
		if (parsed === 'units')
			throw new HcmDomainError('invalid-request', [{ field: 'area', code: 'use-retire' }])
		idValue(id, 'id')
		const command = parseStructureActive(body)
		return this.command(
			context,
			`${parsed}.active`,
			id,
			command,
			key,
			/** Check usage and toggle. */ async (w) => {
				requireRevision(await w.structure.lockRevision(parsed, id), command.expectedRevision)
				if (!command.active && (await w.structure.inUse(parsed, id, w.today)))
					throw new HcmDomainError('structure-in-use')
				await w.structure.setActive(parsed, id, command.active)
				await this.audit(
					w,
					command.active ? 'workforce.structure-activated' : 'workforce.structure-retired',
					parsed,
					id,
					requestId,
					command.reason,
					['active'],
				)
				return w.structure.detail(parsed, id, w.today)
			},
		)
	}

	/** Add a new effective-dated unit version after the latest open version. */
	addUnitVersion(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<StructureItemDto | UnitDetailDto> {
		idValue(id, 'id')
		const command = parseUnitVersion(body)
		return this.command(
			context,
			'units.version',
			id,
			command,
			key,
			/** Validate placement and supersede. */ async (w) => {
				requireRevision(await w.structure.lockRevision('units', id), command.expectedRevision)
				const latest = await w.structure.latestUnitVersion(id)
				const { closeLatestOn } = successorWindow(latest, command.value.effectiveFrom)
				await this.validatePlacement(w, id, command.value)
				await w.structure.addUnitVersion(id, command.value, closeLatestOn)
				await this.audit(
					w,
					'workforce.unit-versioned',
					'units',
					id,
					requestId,
					command.reason,
					Object.keys(command.value),
				)
				return w.structure.detail('units', id, command.value.effectiveFrom)
			},
		)
	}

	/** Retire a unit from a date; blocked while children, assignments or positions depend on it. */
	retireUnit(
		context: AuthenticatedHcmContext,
		id: string,
		body: unknown,
		key: string,
		requestId: string,
	): Promise<StructureItemDto | UnitDetailDto> {
		idValue(id, 'id')
		const command = parseUnitRetire(body)
		return this.command(
			context,
			'units.retire',
			id,
			command,
			key,
			/** Validate and retire. */ async (w) => {
				requireRevision(await w.structure.lockRevision('units', id), command.expectedRevision)
				const latest = await w.structure.latestUnitVersion(id)
				const effectiveTo = retirementDate(latest, command.effectiveTo)
				if (command.successorId !== null) {
					if (command.successorId === id)
						throw new HcmDomainError('invalid-request', [{ field: 'successorId', code: 'self' }])
					await w.structure.requireReference(
						'units',
						command.successorId,
						'successorId',
						effectiveTo,
					)
				}
				const after = new Date(`${effectiveTo}T00:00:00Z`)
				after.setUTCDate(after.getUTCDate() + 1)
				if (await w.structure.inUse('units', id, after.toISOString().slice(0, 10)))
					throw new HcmDomainError('structure-in-use')
				await w.structure.retireUnit(id, effectiveTo, command.successorId)
				await this.audit(w, 'workforce.structure-retired', 'units', id, requestId, command.reason, [
					'effectiveTo',
					'successorId',
				])
				return w.structure.detail('units', id, latest.effectiveFrom)
			},
		)
	}

	/** Validate references and hierarchy rules for a new item; return a unit type's level. */
	private async validateCreate(w: WorkforceWork, command: StructureCreate): Promise<number | null> {
		const s = w.structure
		if (command.area === 'legal-entities') {
			await this.legalEntityReferences(w, command.value)
			return null
		}
		if (command.area === 'unit-types') {
			if (command.parentTypeId === null) return 1
			const parent = await s.unitType(command.parentTypeId)
			if (!parent.enabled)
				throw new HcmDomainError('invalid-request', [{ field: 'parentTypeId', code: 'disabled' }])
			if (parent.hierarchyLevel >= 20)
				throw new HcmDomainError('invalid-request', [{ field: 'parentTypeId', code: 'depth' }])
			return parent.hierarchyLevel + 1
		}
		if (command.area === 'units') {
			await this.validatePlacement(w, null, command.value)
			return null
		}
		if (command.area === 'departments') {
			if (command.value.parentId)
				await s.requireReference('departments', command.value.parentId, 'parentId', w.today)
			if (command.value.headWorkerId)
				await s.requireReference('workers', command.value.headWorkerId, 'headWorkerId', w.today)
			return null
		}
		if (command.area === 'designations') {
			if (command.value.parentId)
				await s.requireReference('designations', command.value.parentId, 'parentId', w.today)
			return null
		}
		await s.requireReference('units', command.value.owningUnitId, 'owningUnitId', w.today)
		await s.requireReference('countries', command.value.countryCode, 'countryCode', w.today)
		return null
	}

	/** Validate references and cycles for an update. */
	private async validateUpdate(
		w: WorkforceWork,
		id: string,
		command: StructureUpdate,
	): Promise<void> {
		const s = w.structure
		if (command.area === 'legal-entities') {
			await this.legalEntityReferences(w, command.value)
			return
		}
		if (command.area === 'departments') {
			if (command.value.parentId) {
				await s.requireReference('departments', command.value.parentId, 'parentId', w.today)
				requireNoCycle(id, await s.ancestors('departments', command.value.parentId, w.today))
			}
			if (command.value.headWorkerId)
				await s.requireReference('workers', command.value.headWorkerId, 'headWorkerId', w.today)
			return
		}
		if (command.area === 'designations') {
			if (command.value.parentId) {
				await s.requireReference('designations', command.value.parentId, 'parentId', w.today)
				requireNoCycle(id, await s.ancestors('designations', command.value.parentId, w.today))
			}
			return
		}
		if (command.area === 'locations') {
			await s.requireReference('units', command.value.owningUnitId, 'owningUnitId', w.today)
			await s.requireReference('countries', command.value.countryCode, 'countryCode', w.today)
		}
	}

	/** Validate legal-entity product and structure references. */
	private async legalEntityReferences(
		w: WorkforceWork,
		value: {
			countryCode: string
			reportingCurrencyCode: string
			registeredLocationId: string | null
		},
	): Promise<void> {
		await w.structure.requireReference('countries', value.countryCode, 'countryCode', w.today)
		await w.structure.requireReference(
			'currencies',
			value.reportingCurrencyCode,
			'reportingCurrencyCode',
			w.today,
		)
		if (value.registeredLocationId)
			await w.structure.requireReference(
				'locations',
				value.registeredLocationId,
				'registeredLocationId',
				w.today,
			)
	}

	/** Enforce type chain, bearing levels, cycles and references for one unit placement. */
	private async validatePlacement(
		w: WorkforceWork,
		unitId: string | null,
		value: UnitVersionInput,
	): Promise<void> {
		const s = w.structure
		const date = value.effectiveFrom
		const type = await s.unitType(value.unitTypeId)
		let parentTypeId: string | null = null
		if (value.parentId) {
			const parent = await s.unitVersionAt(value.parentId, date)
			if (!parent)
				throw new HcmDomainError('invalid-request', [{ field: 'parentId', code: 'not-effective' }])
			parentTypeId = parent.unitTypeId
			if (unitId) requireNoCycle(unitId, await s.ancestors('units', value.parentId, date))
		}
		if (value.legalEntityId)
			await s.requireReference('legal-entities', value.legalEntityId, 'legalEntityId', date)
		if (value.primaryLocationId)
			await s.requireReference('locations', value.primaryLocationId, 'primaryLocationId', date)
		if (value.headWorkerId)
			await s.requireReference('workers', value.headWorkerId, 'headWorkerId', date)
		requireUnitPlacement({
			type,
			parentTypeId,
			parentId: value.parentId,
			legalEntityId: value.legalEntityId,
			siblingOfSameTypeExists: value.parentId
				? await s.siblingOfTypeExists(value.parentId, value.unitTypeId, date, unitId)
				: false,
		})
	}

	/** Append one safe structure audit event. */
	private audit(
		w: WorkforceWork,
		action: string,
		area: StructureArea,
		id: string,
		requestId: string,
		reason: string,
		fields: string[],
	): Promise<string> {
		return w.audit.append({
			action,
			category: 'business',
			targetType: singular[area],
			targetId: id,
			requestId,
			summary: { reason, changedFields: fields, fromState: null, toState: null },
		})
	}

	/** Serialize a structure write and replay identical retries from the actor's receipt. */
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
			'structure.manage',
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
