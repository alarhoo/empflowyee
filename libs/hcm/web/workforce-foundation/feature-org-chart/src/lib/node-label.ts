import type { OrgChartNodeDto } from '@empflowyee/hcm-workforce-foundation-contract'

/** The visible name of a node; the tenant may keep names from the whole organisation. */
export function nodeName(node: Pick<OrgChartNodeDto, 'displayName'>): string {
	return node.displayName ?? 'Name not shared'
}

/** Designation and unit, as far as they are shared. */
export function nodeSubtitle(node: OrgChartNodeDto): string {
	return [node.designation, node.concurrentContextLabel ?? node.organisationUnit]
		.filter(/** Present parts only. */ (part): part is string => Boolean(part))
		.join(' · ')
}

/** Up to two initials of a shared name. */
export function initials(name: string | undefined): string {
	if (!name) return ''
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map(/** First letter. */ (part) => part[0]?.toUpperCase() ?? '')
		.join('')
}
