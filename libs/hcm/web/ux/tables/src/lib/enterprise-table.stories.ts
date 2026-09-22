import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core'
import type { Meta, StoryObj } from '@storybook/angular'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { HcmEnterpriseTable } from './enterprise-table.component'
import {
	DEFAULT_TABLE_QUERY,
	type HcmTableColumn,
	type HcmTableQuery,
	type HcmTableRow,
} from './table.models'
import { queryClientRows } from './client-query'

const fixtureColumns: readonly HcmTableColumn[] = [
	{ id: 'name', label: 'Name', sortable: true, importance: 1 },
	{ id: 'department', label: 'Department', sortable: true, importance: 0 },
	{ id: 'location', label: 'Location', importance: -1 },
]
const fixtureRows: readonly HcmTableRow[] = Array.from(
	{ length: 12 },
	/** Create deterministic fictional rows, never tenant data. */ (_, index) => ({
		id: `DEMO-${index + 1}`,
		cells: {
			name: `Person ${index + 1}`,
			department: index % 2 === 0 ? 'Operations' : 'Finance',
			location: index % 3 === 0 ? 'Bengaluru' : 'Mumbai',
		},
	}),
)

/** Act as a feature/data-access owner while keeping the fake server entirely in memory. */
@Component({
	selector: 'ef-hcm-table-story',
	imports: [HcmEnterpriseTable],
	template: `
		<section class="workshop-content">
			<h1>{{ mode() === 'client' ? 'Client-managed collection' : 'Server-managed collection' }}</h1>
			<p>Search, sorting and pagination only. No selection, export or mutations are enabled.</p>
			<ef-hcm-enterprise-table
				label="People fixture"
				[mode]="mode()"
				[columns]="columns"
				[rows]="visibleRows()"
				[total]="serverTotal()"
				[state]="viewState()"
				[query]="query()"
				(queryRequested)="query.set($event)"
				(retry)="retryCount.set(retryCount() + 1)"
			/>
			@if (mode() === 'server') {
				<pre aria-label="Last server query">{{ requestLabel() }}</pre>
			}
			<p role="status">Retry requests: {{ retryCount() }}</p>
		</section>
	`,
	styles: 'pre { white-space: pre-wrap; overflow-wrap: anywhere; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
class TableStory {
	readonly mode = input<'client' | 'server'>('client')
	readonly state = input<'content' | 'loading' | 'empty' | 'error' | 'denied' | 'unavailable'>(
		'content',
	)
	readonly columns = fixtureColumns
	readonly query = signal<HcmTableQuery>(DEFAULT_TABLE_QUERY)
	readonly serverRows = signal<readonly HcmTableRow[]>([])
	readonly serverTotal = signal(0)
	readonly pending = signal(false)
	readonly retryCount = signal(0)
	readonly requestLabel = computed(
		/** Show the complete server request contract for workshop inspection. */ () =>
			JSON.stringify(this.query(), null, 2),
	)
	readonly visibleRows = computed(
		/** Client mode supplies the whole collection; server mode supplies just a page. */ () => {
			if (this.state() === 'empty') return []
			return this.mode() === 'client' ? fixtureRows : this.serverRows()
		},
	)
	readonly viewState = computed(
		/** Keep explicit demonstration states ahead of simulated latency. */ () => {
			if (this.state() !== 'content') return this.state()
			return this.pending() ? 'loading' : 'content'
		},
	)

	/** Simulate cancellable server queries so rapid searches cannot publish stale fixture pages. */
	constructor() {
		effect(
			/** Consume the emitted query as a feature would, with cleanup for superseded work. */ (
				cleanup,
			) => {
				const mode = this.mode()
				const query = this.query()
				this.pending.set(mode === 'server')
				if (mode !== 'server') return
				const timer = setTimeout(
					/** Resolve only the latest simulated server request. */ () => {
						const result = queryClientRows(fixtureRows, fixtureColumns, query)
						this.serverRows.set(result.rows)
						this.serverTotal.set(result.total)
						this.pending.set(false)
					},
					200,
				)
				cleanup(
					/** Cancel pending fixture latency on query changes or story teardown. */ () =>
						clearTimeout(timer),
				)
			},
		)
	}
}

const meta: Meta<TableStory> = {
	title: 'Tables/Enterprise table',
	component: TableStory,
	args: { mode: 'client', state: 'content' },
}
export default meta
type Story = StoryObj<TableStory>

export const Client: Story = {
	play: /** Search updates only the bounded local collection and resets paging. */ async ({
		canvasElement,
	}) => {
		const host = canvasElement.querySelector('ui5-input')
		await waitFor(
			/** Wait for input upgrade before exercising the public search control. */ () =>
				expect(host?.shadowRoot?.querySelector('input')).toBeTruthy(),
		)
		const input = host?.shadowRoot?.querySelector('input')
		if (!input) throw new globalThis.Error('Table search is unavailable')
		await userEvent.type(input, 'Operations')
		await expect(await within(canvasElement).findByText('6 results')).toBeVisible()
		await expect(within(canvasElement).getByText('Page 1 of 2')).toBeVisible()
	},
}
export const Server: Story = {
	args: { mode: 'server' },
	play: /** Search reaches the feature query contract before a fake server page is returned. */ async ({
		canvasElement,
	}) => {
		const host = canvasElement.querySelector('ui5-input')
		await waitFor(
			/** Native upgrade is a prerequisite to real text entry. */ () =>
				expect(host?.shadowRoot?.querySelector('input')).toBeTruthy(),
		)
		const input = host?.shadowRoot?.querySelector('input')
		if (!input) throw new globalThis.Error('Table search is unavailable')
		await userEvent.type(input, 'Finance')
		await expect(await within(canvasElement).findByText('6 results')).toBeVisible()
		await expect(within(canvasElement).getByLabelText('Last server query')).toHaveTextContent(
			'Finance',
		)
	},
}
export const Loading: Story = { args: { state: 'loading' } }
export const Empty: Story = { args: { state: 'empty' } }
export const Error: Story = { args: { state: 'error' } }
export const PermissionDenied: Story = { args: { state: 'denied' } }
export const Unavailable: Story = { args: { state: 'unavailable' } }
export const ReadOnly: Story = {
	parameters: {
		docs: {
			description: {
				story: 'Rows are read-only in both data modes; query controls remain available.',
			},
		},
	},
}
export const Compact: Story = { globals: { density: 'compact' } }
export const Phone: Story = { globals: { viewport: { value: 'phone', isRotated: false } } }
