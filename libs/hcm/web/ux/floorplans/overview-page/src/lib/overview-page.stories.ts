import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular'
import { expect, userEvent, within } from 'storybook/test'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { HcmOverviewPage } from './overview-page.component'
import { Card } from '@fundamental-ngx/ui5-webcomponents/card'

const meta: Meta<HcmOverviewPage> = {
	title: 'Floorplans/Composed/Overview Page',
	component: HcmOverviewPage,
	decorators: [moduleMetadata({ imports: [Button, Card] })],
	args: {
		title: 'Overview Page',
		summary: 'Fictional workshop records',
		state: 'content',
		readOnly: false,
	},
	/** Project representative business-free regions through the public composition contract. */
	render: (args) => ({
		props: { ...args, retryCount: 0 },
		template: `<div class="workshop-page"><ef-hcm-overview-page [title]="title" [summary]="summary" [state]="state" [readOnly]="readOnly" (retry)="retryCount = retryCount + 1">
   <div hcmActions><ui5-button [disabled]="true">Feature action</ui5-button></div>
   <p hcmHeader>Context supplied by the consuming feature</p>
   <ui5-card accessibleName="Work queue"><div class="workshop-card"><h2>Work queue</h2><p class="workshop-metric">12</p><p>Fictional items awaiting review</p></div></ui5-card>
<ui5-card accessibleName="Completed"><div class="workshop-card"><h2>Completed</h2><p class="workshop-metric">28</p><p>Fictional items this period</p></div></ui5-card>
   <div hcmFooter>Feature-owned footer</div>
  </ef-hcm-overview-page><p role="status">Retry requests: {{ retryCount }}</p></div>`,
	}),
}
export default meta
type Story = StoryObj<HcmOverviewPage>

export const Content: Story = {}
export const Loading: Story = { args: { state: 'loading' } }
export const Empty: Story = { args: { state: 'empty' } }
export const Error: Story = {
	args: { state: 'error' },
	play: /** Retry delegates to the feature callback instead of performing a request in the floorplan. */ async ({
		canvasElement,
	}) => {
		const retry = canvasElement.querySelector('ui5-button')
		if (!retry) throw new globalThis.Error('Retry action was not rendered')
		await userEvent.click(retry)
		await expect(within(canvasElement).getByText('Retry requests: 1')).toBeVisible()
	},
}
export const PermissionDenied: Story = {
	args: { state: 'denied' },
	play: /** The presentation state excludes content while explaining the permission result. */ async ({
		canvasElement,
	}) => {
		const canvas = within(canvasElement)
		await expect(canvas.getByText('You do not have permission to view this content.')).toBeVisible()
		await expect(canvas.queryByText('DEMO-042')).not.toBeInTheDocument()
	},
}
export const Unavailable: Story = { args: { state: 'unavailable' } }
export const ReadOnly: Story = { args: { readOnly: true } }
export const Compact: Story = { globals: { density: 'compact' } }
export const Phone: Story = { globals: { viewport: { value: 'phone', isRotated: false } } }
export const Tablet: Story = { globals: { viewport: { value: 'tablet', isRotated: false } } }

export const ActionState: Story = {
	/** Demonstrate a consumer-owned local action without adding mutation behavior to the floorplan. */
	render: () => ({
		props: { completed: false },
		template: `<div class="workshop-page"><ef-hcm-overview-page title="Overview Page action fixture">
   <ui5-button hcmActions (click)="completed = true" [disabled]="completed">Complete local action</ui5-button>
   <p hcmHeader role="status">{{ completed ? 'Local action completed' : 'Action ready' }}</p>
   <p>Content and action state belong to the consuming feature.</p>
  </ef-hcm-overview-page></div>`,
	}),
	play: /** Our action region must preserve the consumer binding through native header composition. */ async ({
		canvasElement,
	}) => {
		await userEvent.click(within(canvasElement).getByText('Complete local action', { exact: true }))
		await expect(within(canvasElement).getByText('Local action completed')).toBeVisible()
	},
}
