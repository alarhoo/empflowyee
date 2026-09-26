import type {
	DepartmentDto,
	DesignationDto,
	LegalEntityDto,
	LocationDto,
	StructureArea,
	StructureItemDto,
	UnitSummaryDto,
	UnitTypeDto,
} from '@empflowyee/hcm-workforce-foundation-contract'
import { enumLabel } from './structure-areas'

export interface StructureCell {
	text?: string
	check?: boolean
}
export interface StructureRow {
	id: string
	code: string
	name: string
	active: boolean
	cells: StructureCell[]
}
export interface StructureColumn {
	label: string
	importance: number
	minWidth: string
}

/** Column declarations after the fixed name and before the fixed status column. */
export const AREA_COLUMNS: Record<Exclude<StructureArea, 'units'>, StructureColumn[]> = {
	'legal-entities': [
		{ label: 'Entity type', importance: 50, minWidth: '9rem' },
		{ label: 'Country', importance: 40, minWidth: '8rem' },
		{ label: 'Reporting currency', importance: 20, minWidth: '8rem' },
	],
	'unit-types': [
		{ label: 'Parent type', importance: 50, minWidth: '9rem' },
		{ label: 'Level', importance: 30, minWidth: '5rem' },
		{ label: 'Legal entity level', importance: 20, minWidth: '8rem' },
	],
	departments: [
		{ label: 'Parent department', importance: 40, minWidth: '10rem' },
		{ label: 'Head', importance: 30, minWidth: '10rem' },
		{ label: 'Target headcount', importance: 20, minWidth: '7rem' },
	],
	designations: [
		{ label: 'Parent designation', importance: 30, minWidth: '10rem' },
		{ label: 'Display order', importance: 20, minWidth: '6rem' },
	],
	locations: [
		{ label: 'Type', importance: 50, minWidth: '8rem' },
		{ label: 'City', importance: 40, minWidth: '8rem' },
		{ label: 'Country', importance: 30, minWidth: '8rem' },
	],
}

/** Project one API item into the generic area table; the DTO shape depends on the area. */
export function toRow(area: Exclude<StructureArea, 'units'>, item: StructureItemDto): StructureRow {
	const base = { id: item.id, code: (item as { code: string | null }).code ?? '', name: item.name }
	if (area === 'legal-entities') {
		const row = item as LegalEntityDto
		return {
			...base,
			active: row.active,
			cells: [
				{ text: enumLabel(row.entityType) },
				{ text: row.country.name },
				{ text: row.reportingCurrency.code },
			],
		}
	}
	if (area === 'unit-types') {
		const row = item as UnitTypeDto
		return {
			...base,
			active: row.enabled,
			cells: [
				{ text: row.parentType?.name ?? '—' },
				{ text: String(row.hierarchyLevel) },
				{ check: row.legalEntityBearing },
			],
		}
	}
	if (area === 'departments') {
		const row = item as DepartmentDto
		return {
			...base,
			active: row.active,
			cells: [
				{ text: row.parent?.name ?? '—' },
				{ text: row.headWorker?.displayName ?? '—' },
				{ text: row.targetHeadcount === null ? '—' : String(row.targetHeadcount) },
			],
		}
	}
	if (area === 'designations') {
		const row = item as DesignationDto
		return {
			...base,
			active: row.active,
			cells: [{ text: row.parent?.name ?? '—' }, { text: String(row.sortOrder) }],
		}
	}
	const row = item as LocationDto
	return {
		...base,
		active: row.active,
		cells: [{ text: enumLabel(row.locationType) }, { text: row.city }, { text: row.country.name }],
	}
}

/** Describe a unit's type and legal entity for its tree node. */
export function unitSubtitle(unit: UnitSummaryDto): string {
	const entity = unit.legalEntity
		? `${unit.legalEntity.name}${unit.legalEntityInherited ? ' (inherited)' : ''}`
		: ''
	return [unit.unitType.name, entity].filter(Boolean).join(' · ')
}
