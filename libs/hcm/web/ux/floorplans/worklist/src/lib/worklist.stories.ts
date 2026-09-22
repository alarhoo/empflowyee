import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular'
import { expect, userEvent, within } from 'storybook/test'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { HcmWorklist } from './worklist.component'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'

const meta: Meta<HcmWorklist> = {
	title: 'Floorplans/Composed/Worklist',
	component: HcmWorklist,
	decorators: [
		moduleMetadata({
			imports: [Button, Input, Table, TableRow, TableCell, TableHeaderRow, TableHeaderCell],
		}),
	],
	args: {
		title: 'Worklist',
		summary: 'Fictional workshop records',
		state: 'content',
		readOnly: false,
	},
	/** Project representative business-free regions through the public composition contract. */
	render: (args) => ({
		props: { ...args, retryCount: 0 },
		template: `<div class="workshop-page"><ef-hcm-worklist [title]="title" [summary]="summary" [state]="state" [readOnly]="readOnly" (retry)="retryCount = retryCount + 1">
   <div hcmActions><ui5-button [disabled]="true">Feature action</ui5-button></div>
   <p hcmHeader>Context supplied by the consuming feature</p>
   <div hcmFilters><ui5-input accessibleName="Search fixture" placeholder="Search is owned by the feature" /></div>
<div hcmResultToolbar>2 fictional records · feature supplies query and actions</div>

<ui5-table accessibleName="Fixture results" overflowMode="Popin">
 <ui5-table-header-row slot="headerRow"><ui5-table-header-cell>Reference</ui5-table-header-cell><ui5-table-header-cell>State</ui5-table-header-cell></ui5-table-header-row>
 <ui5-table-row><ui5-table-cell>DEMO-042</ui5-table-cell><ui5-table-cell>Ready</ui5-table-cell></ui5-table-row>
 <ui5-table-row><ui5-table-cell>DEMO-043</ui5-table-cell><ui5-table-cell>In review</ui5-table-cell></ui5-table-row>
</ui5-table>
   <div hcmFooter>Feature-owned footer</div>
  </ef-hcm-worklist><p role="status">Retry requests: {{ retryCount }}</p></div>`,
	}),
}
export default meta
type Story = StoryObj<HcmWorklist>

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
		template: `<div class="workshop-page"><ef-hcm-worklist title="Worklist action fixture">
   <ui5-button hcmActions (click)="completed = true" [disabled]="completed">Complete local action</ui5-button>
   <p hcmHeader role="status">{{ completed ? 'Local action completed' : 'Action ready' }}</p>
   <p>Content and action state belong to the consuming feature.</p>
  </ef-hcm-worklist></div>`,
	}),
	play: /** Our action region must preserve the consumer binding through native header composition. */ async ({
		canvasElement,
	}) => {
		await userEvent.click(within(canvasElement).getByText('Complete local action', { exact: true }))
		await expect(within(canvasElement).getByText('Local action completed')).toBeVisible()
	},
}
