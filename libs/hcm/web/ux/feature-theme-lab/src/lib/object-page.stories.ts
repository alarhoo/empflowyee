import { type Meta, type StoryObj } from '@storybook/angular'
import { expect, userEvent, within } from 'storybook/test'
import { ObjectPageExample } from './object-page-example.component'

const meta: Meta<ObjectPageExample> = {
	id: 'floorplans-composed-object-page',
	title: 'Floorplans/Composed/Object Page',
	component: ObjectPageExample,
	args: { state: 'content', readOnly: false },
	parameters: {
		hcmReview:
			'Object Page is a production-code proof awaiting accessibility acceptance. Installed native tab/form markup has unresolved axe findings; do not select this pattern for a feature yet. See docs/hcm/ux/floorplans/validation.md.',
		docs: {
			description: {
				component:
					'Production HcmObjectPage composes native UI5 DynamicPage, Toolbar and TabContainer. Native controls own header snapping, pinning, action overflow and keyboard section selection. Use for one object with grouped information; use a list floorplan for collections. Local employee data and edits are disposable.',
			},
		},
	},
}
export default meta
type Story = StoryObj<ObjectPageExample>
export const Content: Story = {}
export const LocalEdit: Story = {
	play: /** Mutating actions belong to the consumer and preserve the shared floorplan implementation. */ async ({
		canvasElement,
	}) => {
		const canvas = within(canvasElement)
		await userEvent.click(await canvas.findByRole('button', { name: 'Edit preview' }))
		await expect(
			canvas.getByText('Editing a disposable preview. No employee data will be persisted.'),
		).toBeVisible()
		await userEvent.click(canvas.getByText('Cancel edit', { exact: true }))
		await expect(canvas.getByText('Preview changes discarded.')).toBeVisible()
	},
}
export const RecoverableError: Story = {
	args: { state: 'error' },
	play: /** Retry restores the actual production object presentation without a server request. */ async ({
		canvasElement,
	}) => {
		await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Retry' }))
		await expect(within(canvasElement).getByText('Active employee')).toBeVisible()
	},
}
export const ReadOnly: Story = {
	args: { readOnly: true },
	play: /** Read-only retains informational actions and omits mutation actions. */ async ({
		canvasElement,
	}) => {
		const canvas = within(canvasElement)
		await expect(canvas.queryByRole('button', { name: 'Edit preview' })).not.toBeInTheDocument()
		await userEvent.click(await canvas.findByRole('button', { name: 'Show reference' }))
		await expect(canvas.getByText('Employee reference: DEMO-042.')).toBeVisible()
	},
}
export const Loading: Story = { args: { state: 'loading' } }
export const MissingObject: Story = { args: { state: 'empty' } }
export const PermissionRequired: Story = { args: { state: 'denied' } }
export const Unavailable: Story = { args: { state: 'unavailable' } }
