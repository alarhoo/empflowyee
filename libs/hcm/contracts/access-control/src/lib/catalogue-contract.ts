export interface CataloguePlacement {
	spaceId: string
	spaceTitle: string
	pageId: string
	pageTitle: string
	sectionId: string
	sectionTitle: string
	display: string
}
export interface CatalogueEntry {
	appCode: string
	title: string
	domain: string
	status: string
	route: string | null
	discoveryPermission: string
	entitlement: string
	entitled: boolean
	placements: CataloguePlacement[]
}
export interface CatalogueAccount {
	id: string
	displayName: string
	email: string
}
export type DiscoveryReason =
	'account-disabled' | 'missing-discovery-permission' | 'missing-entitlement' | 'no-role-placement'
export interface CatalogueDiscovery {
	accountId: string
	items: { appCode: string; discoverable: boolean; reasons: DiscoveryReason[] }[]
}
