import { type Meta, type StoryObj } from '@storybook/angular'
import { expect, userEvent, within } from 'storybook/test'
import { DynamicPageExample } from './dynamic-page-example.component'

const meta: Meta<DynamicPageExample> = {
	title: 'Floorplans/Native/Dynamic Page',
	component: DynamicPageExample,
	args: { state: 'content', readOnly: false },
	parameters: {
		docs: {
			description: {
				component:
					'Production HcmDynamicPage over the maintained UI5 DynamicPage. Use for persistent title/actions with collapsible context. Do not use for a simple bounded page. The same fictional directory is rendered in Theme Lab.',
			},
		},
	},
}
export default meta
type Story = StoryObj<DynamicPageExample>
export const Content: Story = {}
export const RecoverableError: Story = {
	args: { state: 'error' },
	play: /** The production example recovers through the floorplan retry output. */ async ({
		canvasElement,
	}) => {
		await userEvent.click(within(canvasElement).getByText('Retry', { exact: true }))
		await expect(within(canvasElement).getByText('Employees (32)')).toBeVisible()
	},
}
export const Loading: Story = { args: { state: 'loading' } }
export const Empty: Story = { args: { state: 'empty' } }
export const PermissionRequired: Story = { args: { state: 'denied' } }
export const Unavailable: Story = { args: { state: 'unavailable' } }
export const ReadOnly: Story = { args: { readOnly: true } }
