import type { StorybookConfig } from '@storybook/angular'

// Both production floorplans stay visible; their stories document outstanding acceptance findings.
const stories = [
	'../../../../libs/hcm/web/ux/feature-theme-lab/src/lib/dynamic-page.stories.ts',
	'../../../../libs/hcm/web/ux/feature-theme-lab/src/lib/object-page.stories.ts',
]

const config: StorybookConfig = {
	stories,
	addons: [],
	framework: { name: '@storybook/angular', options: {} },
	core: { disableTelemetry: true },
}

export default config
