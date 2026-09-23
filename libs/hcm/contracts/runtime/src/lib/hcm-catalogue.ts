export interface HcmCatalogueApp {
	appCode: string
	title: string
	domain: string
	catalogueIds: readonly string[]
	route: string | null
	floorplan: string | null
	implementationStatus: string
	fddStatus: string
	tddStatus: string
	discoveryPolicy: { permission: string; entitlement: string }
}
export interface HcmCatalogue {
	apps: readonly HcmCatalogueApp[]
	spaces: readonly {
		spaceId: string
		title: string
		description: string
		pageIds: readonly string[]
	}[]
	pages: readonly {
		pageId: string
		title: string
		description: string
		sections: readonly {
			sectionId: string
			title: string
			display: string
			appCodes: readonly string[]
		}[]
	}[]
	businessRoles: readonly {
		roleId: string
		title: string
		description: string
		catalogueIds: readonly string[]
		spaceIds: readonly string[]
	}[]
	domains: readonly { domain: string; deliveryWaves: readonly string[]; apps: readonly string[] }[]
}
