import { type Provider } from '@angular/core'
import { provideContentDensity } from '@fundamental-ngx/core/content-density'
import { provideTheming } from '@fundamental-ngx/core/theming'

/** Install identical native theme and density services in HCM and its curated Storybook. */
export function provideHcmUx(): Provider[] {
	return [
		...provideContentDensity({ storage: 'memory' }),
		...provideTheming({
			defaultTheme: 'sap_horizon',
			changeThemeOnQueryParamChange: false,
			themeStyleLinkIdentifiers: {
				'base-theme': 'hcm-sap-theme',
				'custom-theme': 'hcm-fundamental-theme',
			},
			customThemes: [
				{
					id: 'sap_horizon',
					name: 'Horizon Light',
					theming: {
						themingBasePath: '/assets/hcm/theming/Base/baseLib/sap_horizon/css_variables.css',
						themePath: '/assets/hcm/fundamental/sap_horizon.css',
					},
				},
				{
					id: 'sap_horizon_dark',
					name: 'Horizon Dark',
					theming: {
						themingBasePath: '/assets/hcm/theming/Base/baseLib/sap_horizon_dark/css_variables.css',
						themePath: '/assets/hcm/fundamental/sap_horizon_dark.css',
					},
				},
			],
		}),
	]
}
