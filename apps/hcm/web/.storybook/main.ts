import type { StorybookConfig } from '@storybook/angular'

// Production pilots and the earlier Dynamic Page proof remain visible with their review status.
const stories = [
	'../../../../libs/hcm/web/ux/feature-theme-lab/src/lib/dynamic-page.stories.ts',
	'../../../../libs/hcm/web/ux/feature-theme-lab/src/lib/object-page.stories.ts',
	'../../../../libs/hcm/web/ux/floorplans/tool-page-layout/src/lib/tool-page-layout.stories.ts',
]

const config: StorybookConfig = {
	stories,
	addons: [],
	framework: { name: '@storybook/angular', options: {} },
	core: { disableTelemetry: true },
}

export default config
