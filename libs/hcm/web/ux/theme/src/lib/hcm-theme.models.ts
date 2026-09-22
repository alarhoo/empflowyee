export type HcmThemeVariant = 'horizon-light' | 'horizon-dark' | 'her-light' | 'her-dark'

export interface HcmThemeDefinition {
	id: HcmThemeVariant
	label: string
	family: 'horizon' | 'her'
	dark: boolean
	ui5Theme: 'sap_horizon' | 'sap_horizon_dark'
}

export const HCM_THEMES: readonly HcmThemeDefinition[] = [
	{
		id: 'horizon-light',
		label: 'Horizon Light',
		family: 'horizon',
		dark: false,
		ui5Theme: 'sap_horizon',
	},
	{
		id: 'horizon-dark',
		label: 'Horizon Dark',
		family: 'horizon',
		dark: true,
		ui5Theme: 'sap_horizon_dark',
	},
	{ id: 'her-light', label: 'HER Light', family: 'her', dark: false, ui5Theme: 'sap_horizon' },
	{ id: 'her-dark', label: 'HER Dark', family: 'her', dark: true, ui5Theme: 'sap_horizon_dark' },
]
