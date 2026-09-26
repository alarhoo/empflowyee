import type { DirectoryEntryDto, DirectoryLinkDto } from '@empflowyee/hcm-employee-contract'

/** The name a viewer may see: preferred name first, then display name. */
export function personName(
	entry: Pick<DirectoryEntryDto, 'displayName' | 'preferredName'> | DirectoryLinkDto,
): string {
	const preferred = 'preferredName' in entry ? entry.preferredName : undefined
	return preferred || entry.displayName || 'Name not shared'
}

/** Up to two initials of a shared name. */
export function personInitials(
	entry: Pick<DirectoryEntryDto, 'displayName' | 'preferredName'>,
): string {
	const name = entry.displayName ?? entry.preferredName
	if (!name) return ''
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map(/** First letter. */ (part) => part[0]?.toUpperCase() ?? '')
		.join('')
}
