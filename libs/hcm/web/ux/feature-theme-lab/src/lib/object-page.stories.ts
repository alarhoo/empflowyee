import { type Meta, type StoryObj } from '@storybook/angular'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { ObjectPageExample } from './object-page-example.component'

/** Find a native configuration host by its documented text property. */
function toolbarItem(canvas: HTMLElement, label: string): HTMLElement | undefined {
	return Array.from(
		canvas.querySelectorAll<HTMLElement & { text?: string }>('ui5-toolbar-button'),
	).find(/** Match the production action label. */ (item) => item.text === label)
}
/** Click the real rendered native button; Testing Library does not traverse shadow roots automatically. */
async function clickToolbar(canvas: HTMLElement, label: string): Promise<void> {
	let button: HTMLElement | null = null
	await waitFor(
		/** Await native custom-element rendering without synthetic output dispatch. */ () => {
			const root = toolbarItem(canvas, label)?.shadowRoot?.querySelector('ui5-button')?.shadowRoot
			if (!root) throw new Error('Native action not rendered')
			button = within(root as unknown as HTMLElement).getByRole('button', {
				name: label,
			})
		},
	)
	if (!button) throw new Error('Native action unavailable')
	await userEvent.click(button)
}

const meta: Meta<ObjectPageExample> = {
	id: 'floorplans-composed-object-page',
	title: 'Floorplans/Composed/Object Page',
	component: ObjectPageExample,
	args: { state: 'content', readOnly: false },
	parameters: {
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
		await clickToolbar(canvasElement, 'Edit preview')
		await expect(
			canvas.getByText('Editing a disposable preview. No employee data will be persisted.'),
		).toBeVisible()
		await clickToolbar(canvasElement, 'Cancel edit')
		await expect(canvas.getByText('Preview changes discarded.')).toBeVisible()
	},
}
export const RecoverableError: Story = {
	args: { state: 'error' },
	play: /** Retry restores the actual production object presentation without a server request. */ async ({
		canvasElement,
	}) => {
		await userEvent.click(await within(canvasElement).findByText('Retry', { exact: true }))
		await expect(within(canvasElement).getByText('Active employee')).toBeVisible()
	},
}
export const ReadOnly: Story = {
	args: { readOnly: true },
	play: /** Read-only retains informational actions and omits mutation actions. */ async ({
		canvasElement,
	}) => {
		const canvas = within(canvasElement)
		await expect(toolbarItem(canvasElement, 'Edit preview')).toBeUndefined()
		await clickToolbar(canvasElement, 'Show reference')
		await expect(canvas.getByText('Employee reference: DEMO-042.')).toBeVisible()
	},
}
export const Loading: Story = { args: { state: 'loading' } }
export const MissingObject: Story = { args: { state: 'empty' } }
export const PermissionRequired: Story = { args: { state: 'denied' } }
export const Unavailable: Story = { args: { state: 'unavailable' } }
