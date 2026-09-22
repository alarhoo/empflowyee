import '../src/ui5-init'
import { provideZoneChangeDetection } from '@angular/core'
import {
	applicationConfig,
	componentWrapperDecorator,
	moduleMetadata,
	type Preview,
} from '@storybook/angular'
import { provideHcmUx } from '@empflowyee/hcm-web-ux-theme'
import { HcmStoryFrame } from './theme-frame'

const brands: Record<string, string | null> = {
	default: null,
	amethyst: '#7a4de8',
	coral: '#d65a4a',
	emerald: '#147d64',
}

const preview: Preview = {
	globalTypes: {
		theme: {
			description: 'HCM theme',
			toolbar: {
				icon: 'paintbrush',
				dynamicTitle: true,
				items: [
					{ value: 'horizon-light', title: 'Horizon Light' },
					{ value: 'horizon-dark', title: 'Horizon Dark' },
					{ value: 'her-light', title: 'HER Light' },
					{ value: 'her-dark', title: 'HER Dark' },
				],
			},
		},
		brand: {
			description: 'Tenant accent',
			toolbar: {
				icon: 'circlehollow',
				dynamicTitle: true,
				items: [
					{ value: 'default', title: 'No tenant override' },
					{ value: 'amethyst', title: 'Amethyst' },
					{ value: 'coral', title: 'Coral' },
					{ value: 'emerald', title: 'Emerald' },
				],
			},
		},
		density: {
			description: 'Content density',
			toolbar: { icon: 'collapse', dynamicTitle: true, items: ['cozy', 'compact'] },
		},
	},
	initialGlobals: {
		theme: 'horizon-light',
		brand: 'default',
		density: 'cozy',
		viewport: { value: 'desktop', isRotated: false },
	},
	parameters: {
		layout: 'fullscreen',
		viewport: {
			options: {
				desktop: { name: 'Desktop', styles: { width: '1440px', height: '960px' }, type: 'desktop' },
				tablet: { name: 'Tablet', styles: { width: '768px', height: '1024px' }, type: 'tablet' },
				phone: { name: 'Phone', styles: { width: '390px', height: '844px' }, type: 'mobile' },
			},
		},
	},
	decorators: [
		moduleMetadata({ imports: [HcmStoryFrame] }),
		applicationConfig({
			providers: [provideZoneChangeDetection(), ...provideHcmUx()],
		}),
		componentWrapperDecorator(
			HcmStoryFrame,
			/** Translate controlled toolbar presets into inputs for the production theme bridge. */ (
				context,
			) => ({
				variant: context.globals['theme'],
				review: context.parameters['hcmReview'] ?? null,
				brand: brands[context.globals['brand']] ?? null,
				density: context.globals['density'],
			}),
		),
	],
}

export default preview
