import type { StructureArea } from '@empflowyee/hcm-workforce-foundation-contract'

export type StructureSection = 'organisation' | StructureArea

export interface StructureAreaInfo {
	id: StructureSection
	label: string
	singular: string
	description: string
	/** Many-field areas are created and edited on a dedicated route; the others use a Dialog. */
	routed: boolean
	/** Bounded client lists are loaded whole (maximum 200); the others page on the server. */
	client: boolean
}

export const STRUCTURE_SECTIONS: readonly StructureAreaInfo[] = [
	{
		id: 'organisation',
		label: 'Organisation',
		singular: 'Organisation',
		description: 'HR defaults and headquarters',
		routed: false,
		client: false,
	},
	{
		id: 'legal-entities',
		label: 'Legal entities',
		singular: 'Legal entity',
		description: 'Registered employers',
		routed: true,
		client: true,
	},
	{
		id: 'unit-types',
		label: 'Unit types',
		singular: 'Unit type',
		description: 'Levels of the unit hierarchy',
		routed: false,
		client: true,
	},
	{
		id: 'units',
		label: 'Units',
		singular: 'Unit',
		description: 'Effective-dated organisation units',
		routed: true,
		client: false,
	},
	{
		id: 'departments',
		label: 'Departments',
		singular: 'Department',
		description: 'Functional groupings',
		routed: false,
		client: false,
	},
	{
		id: 'designations',
		label: 'Designations',
		singular: 'Designation',
		description: 'Job titles without grade meaning',
		routed: false,
		client: false,
	},
	{
		id: 'locations',
		label: 'Locations',
		singular: 'Location',
		description: 'Offices, sites and remote locations',
		routed: true,
		client: false,
	},
]

export const MANAGE_PERMISSION = 'hcm.workforce-foundation.structure.manage'

/** Resolve a route segment to known area metadata; unknown segments select nothing. */
export function sectionInfo(id: string | null | undefined): StructureAreaInfo | null {
	return (
		STRUCTURE_SECTIONS.find(/** Match the stable area identity. */ (item) => item.id === id) ?? null
	)
}

export const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
] as const

/** Offer the organisation languages the product presents; a stored tag outside the list is kept. */
export function languageOptions(current: string): { value: string; label: string }[] {
	const tags = ['en-US', 'en-GB', 'en-IN', 'hi-IN', 'de-DE', 'fr-FR', 'es-ES']
	if (current && !tags.includes(current)) tags.unshift(current)
	const names = new Intl.DisplayNames(['en'], { type: 'language' })
	return tags.map(
		/** Label each BCP 47 tag with its English display name. */ (value) => ({
			value,
			label: `${names.of(value) ?? value} (${value})`,
		}),
	)
}

/** List IANA time zones supported by the browser for the time-zone ComboBox. */
export function timeZones(): string[] {
	return Intl.supportedValuesOf('timeZone')
}

/** Split a camel-case enum value into readable words. */
export function enumLabel(value: string | null | undefined): string {
	return value ? value.replace(/([a-z])([A-Z])/g, '$1 $2') : '—'
}
