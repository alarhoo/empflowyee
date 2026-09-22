// Storybook theme contract — adapt to the generated Storybook API version.
// Reuse HcmThemeService / the existing theme tokens. Do not create a second theme implementation.

export const HCM_STORYBOOK_THEMES = [
	'horizon-light',
	'horizon-dark',
	'her-light',
	'her-dark',
] as const

export const TENANT_BRAND_PRESETS = {
	default: null,
	amethyst: '#7A4DE8',
	coral: '#D65A4A',
	emerald: '#147D64',
} as const
