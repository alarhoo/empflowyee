import { form, FormField } from '@angular/forms/signals'
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'

const PEOPLE = [
	'Alex Morgan',
	'Priya Shah',
	'Daniel Kim',
	'Amara Okafor',
	'Sofia Garcia',
	'Noah Wilson',
	'Mei Chen',
	'Oliver Brown',
]
const LOCATIONS = ['Bengaluru', 'London', 'Singapore']
const TEAMS = ['People Operations', 'Engineering', 'Customer Experience']

/** Exercise the production Dynamic Page with a bounded fictional directory in both developer surfaces. */
@Component({
	selector: 'ef-hcm-dynamic-page-example',
	imports: [
		HcmDynamicPage,
		FormField,
		Input,
		Form,
		FormItem,
		Label,
		Table,
		TableHeaderRow,
		TableHeaderCell,
		TableRow,
		TableCell,
		Title,
		MessageStrip,
	],
	templateUrl: './dynamic-page-example.component.html',
	styleUrl: './floorplan-examples.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DynamicPageExample {
	readonly state = input<HcmPageState>('content')
	readonly readOnly = input(false)
	readonly search = signal({ query: '' })
	readonly searchForm = form(this.search)
	readonly notice = signal('')
	readonly recovered = signal(false)
	readonly effectiveState = computed(
		/** A local retry demonstrates recovery without a product request. */ () =>
			this.state() === 'error' && this.recovered() ? 'content' : this.state(),
	)
	readonly actions = [
		{ id: 'reset', label: 'Reset filters' },
		{ id: 'summary', label: 'Show summary' },
	]
	readonly employees = Array.from(
		{ length: 32 },
		/** Provide enough real table rows to exercise native header snapping. */ (_, index) => ({
			id: 'DEMO-' + String(index + 1).padStart(3, '0'),
			name: PEOPLE[index % PEOPLE.length],
			role: index % 2 ? 'People Partner' : 'Specialist',
			team: TEAMS[index % TEAMS.length],
			location: LOCATIONS[index % LOCATIONS.length],
		}),
	)
	readonly rows = computed(
		/** Filter only the local fixture; the floorplan owns no data operations. */ () => {
			const query = this.search().query.trim().toLocaleLowerCase('en')
			return this.employees.filter(
				/** Match displayed directory fields. */ (row) =>
					[row.name, row.id, row.team, row.location]
						.join(' ')
						.toLocaleLowerCase('en')
						.includes(query),
			)
		},
	)

	/** Handle real, reversible preview actions without pretending to persist business records. */
	handleAction(id: string): void {
		if (id === 'reset') {
			this.search.set({ query: '' })
			this.notice.set('Filters reset.')
		} else {
			this.notice.set(this.rows().length + ' fictional employees in this view.')
		}
	}
}
