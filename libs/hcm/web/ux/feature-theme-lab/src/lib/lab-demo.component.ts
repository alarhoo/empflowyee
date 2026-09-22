import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	input,
	signal,
	viewChild,
} from '@angular/core'
import { Avatar } from '@fundamental-ngx/ui5-webcomponents/avatar'
import { AvatarGroup } from '@fundamental-ngx/ui5-webcomponents/avatar-group'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Breadcrumbs } from '@fundamental-ngx/ui5-webcomponents/breadcrumbs'
import { BreadcrumbsItem } from '@fundamental-ngx/ui5-webcomponents/breadcrumbs-item'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Calendar } from '@fundamental-ngx/ui5-webcomponents/calendar'
import { CalendarLegend } from '@fundamental-ngx/ui5-webcomponents/calendar-legend'
import { Card } from '@fundamental-ngx/ui5-webcomponents/card'
import { CardHeader } from '@fundamental-ngx/ui5-webcomponents/card-header'
import { DateRangePicker } from '@fundamental-ngx/ui5-webcomponents/date-range-picker'
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog'
import { DynamicDateRange } from '@fundamental-ngx/ui5-webcomponents/dynamic-date-range'
import { FlexibleColumnLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { ListItemCustom } from '@fundamental-ngx/ui5-webcomponents/list-item-custom'
import { ListItemStandard } from '@fundamental-ngx/ui5-webcomponents/list-item-standard'
import { Link } from '@fundamental-ngx/ui5-webcomponents/link'
import { List } from '@fundamental-ngx/ui5-webcomponents/list'
import { Menu } from '@fundamental-ngx/ui5-webcomponents/menu'
import { MenuItem } from '@fundamental-ngx/ui5-webcomponents/menu-item'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { HcmToolPageLayout } from '@empflowyee/hcm-web-ux-floorplan-tool-page-layout'
import { Option } from '@fundamental-ngx/ui5-webcomponents/option'
import { Page } from '@fundamental-ngx/ui5-webcomponents-fiori/page'
import { Panel } from '@fundamental-ngx/ui5-webcomponents/panel'
import { Popover } from '@fundamental-ngx/ui5-webcomponents/popover'
import { ProgressIndicator } from '@fundamental-ngx/ui5-webcomponents/progress-indicator'
import { RangeSlider } from '@fundamental-ngx/ui5-webcomponents/range-slider'
import { SegmentedButton } from '@fundamental-ngx/ui5-webcomponents/segmented-button'
import { SegmentedButtonItem } from '@fundamental-ngx/ui5-webcomponents/segmented-button-item'
import { Select } from '@fundamental-ngx/ui5-webcomponents/select'
import { SideNavigation } from '@fundamental-ngx/ui5-webcomponents-fiori/side-navigation'
import { SideNavigationItem } from '@fundamental-ngx/ui5-webcomponents-fiori/side-navigation-item'
import { Slider } from '@fundamental-ngx/ui5-webcomponents/slider'
import { SortItem } from '@fundamental-ngx/ui5-webcomponents-fiori/sort-item'
import { SplitButton } from '@fundamental-ngx/ui5-webcomponents/split-button'
import { Table } from '@fundamental-ngx/ui5-webcomponents/table'
import { TableCell } from '@fundamental-ngx/ui5-webcomponents/table-cell'
import { TableHeaderCell } from '@fundamental-ngx/ui5-webcomponents/table-header-cell'
import { TableHeaderRow } from '@fundamental-ngx/ui5-webcomponents/table-header-row'
import { TableRow } from '@fundamental-ngx/ui5-webcomponents/table-row'
import { Tag } from '@fundamental-ngx/ui5-webcomponents/tag'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { TextArea } from '@fundamental-ngx/ui5-webcomponents/text-area'
import { Timeline } from '@fundamental-ngx/ui5-webcomponents-fiori/timeline'
import { TimelineItem } from '@fundamental-ngx/ui5-webcomponents-fiori/timeline-item'
import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { ToggleButton } from '@fundamental-ngx/ui5-webcomponents/toggle-button'
import { Toolbar } from '@fundamental-ngx/ui5-webcomponents/toolbar'
import { ToolbarButton } from '@fundamental-ngx/ui5-webcomponents/toolbar-button'
import { ViewSettingsDialog } from '@fundamental-ngx/ui5-webcomponents-fiori/view-settings-dialog'
import { form, FormField } from '@angular/forms/signals'
import { LAB_EMPLOYEES, LAB_LEAVE, LAB_PROJECTS } from './lab-data'
import { LabProfileComponent } from './lab-profile.component'
@Component({
	standalone: true,
	selector: 'ef-hcm-lab-demo',
	imports: [
		Avatar,
		AvatarGroup,
		Bar,
		Breadcrumbs,
		BreadcrumbsItem,
		Button,
		Calendar,
		CalendarLegend,
		Card,
		CardHeader,
		DateRangePicker,
		Dialog,
		DynamicDateRange,
		FlexibleColumnLayout,
		Form,
		FormItem,
		Input,
		Label,
		ListItemCustom,
		ListItemStandard,
		Link,
		List,
		Menu,
		MenuItem,
		MessageStrip,
		HcmToolPageLayout,
		Option,
		Page,
		Panel,
		Popover,
		ProgressIndicator,
		RangeSlider,
		SegmentedButton,
		SegmentedButtonItem,
		Select,
		SideNavigation,
		SideNavigationItem,
		Slider,
		SortItem,
		SplitButton,
		Table,
		TableCell,
		TableHeaderCell,
		TableHeaderRow,
		TableRow,
		Tag,
		Text,
		TextArea,
		Timeline,
		TimelineItem,
		Title,
		ToggleButton,
		Toolbar,
		ToolbarButton,
		ViewSettingsDialog,
		FormField,
		LabProfileComponent,
	],
	templateUrl: './lab-demo.component.html',
	styleUrl: './lab.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabDemoComponent {
	readonly toolPage = viewChild(HcmToolPageLayout)
	readonly navigation = input<{ area: 'Employee' | 'Leave' | 'Projects'; query: string }>({
		area: 'Employee',
		query: '',
	})
	/** Apply shell/landing-page navigation after the deferred native workspace is created. */
	constructor() {
		effect(
			/** Start a requested area and its local search without relying on view timing. */ () => {
				const request = this.navigation()
				this.selectArea(request.area)
				this.search.set({ query: request.query })
			},
		)
	}

	readonly area = signal<'Employee' | 'Leave' | 'Projects'>('Employee')
	readonly layout = signal<NonNullable<ReturnType<FlexibleColumnLayout['layout']>>>('OneColumn')
	readonly selectedId = signal('')
	readonly search = signal({ query: '' })
	readonly searchForm = form(this.search)
	readonly department = signal('All')
	readonly departments = ['Leadership', 'Sales', 'Operations', 'Finance', 'People']
	readonly descending = signal(false)
	readonly pendingOnly = signal(false)
	readonly sortOpen = signal(false)
	readonly requestOpen = signal(false)
	readonly requestError = signal('')
	readonly request = signal({ dates: '', notes: '' })
	readonly requestForm = form(this.request)
	readonly menuOpen = signal(false)
	readonly helpOpen = signal(false)
	readonly following = signal(false)
	readonly capacity = signal(60)
	readonly context = signal<{ title: string; description: string } | null>(null)
	readonly employees = computed(
		/** Filter and sort the local directory without API requests. */ () =>
			LAB_EMPLOYEES.filter(
				/** Match the name, role and department filters. */ (person) =>
					(this.department() === 'All' || person.department === this.department()) &&
					`${person.name} ${person.position} ${person.id}`
						.toLowerCase()
						.includes(this.search().query.toLowerCase()),
			).sort(
				/** Apply the selected name ordering. */ (a, b) =>
					a.name.localeCompare(b.name) * (this.descending() ? -1 : 1),
			),
	)
	readonly leaveRequests = computed(
		/** Apply leave status and name search locally. */ () =>
			LAB_LEAVE.filter(
				/** Match the selected request filters. */ (request) =>
					(!this.pendingOnly() || request.status === 'Pending') &&
					request.name.toLowerCase().includes(this.search().query.toLowerCase()),
			).sort(
				/** Apply the name ordering to requests. */ (a, b) =>
					a.name.localeCompare(b.name) * (this.descending() ? -1 : 1),
			),
	)
	readonly projects = computed(
		/** Search and sort fictional projects locally. */ () =>
			LAB_PROJECTS.filter(
				/** Match a project name. */ (project) =>
					project.name.toLowerCase().includes(this.search().query.toLowerCase()),
			).sort(
				/** Apply project name ordering. */ (a, b) =>
					a.name.localeCompare(b.name) * (this.descending() ? -1 : 1),
			),
	)
	readonly selectedEmployee = computed(
		/** Resolve a selected employee only within the directory. */ () =>
			LAB_EMPLOYEES.find(
				/** Match its stable fixture identifier. */ (person) => person.id === this.selectedId(),
			),
	)
	readonly selectedLeave = computed(
		/** Resolve the selected leave detail. */ () =>
			LAB_LEAVE.find(
				/** Match request identity. */ (request) => request.id === this.selectedId(),
			) ?? LAB_LEAVE[0],
	)
	readonly selectedProject = computed(
		/** Resolve the selected project detail. */ () =>
			LAB_PROJECTS.find(
				/** Match project identity. */ (project) => project.id === this.selectedId(),
			) ?? LAB_PROJECTS[0],
	)
	/** Switch native navigation and reset drill-down state for the new area. */
	selectArea(area: 'Employee' | 'Leave' | 'Projects'): void {
		this.area.set(area)
		this.selectedId.set('')
		this.search.set({ query: '' })
		this.context.set(null)
		this.layout.set('OneColumn')
		this.toolPage()?.resetNavigation()
	}
	/** Open the native middle column for a selected employee. */
	selectEmployee(id: string): void {
		this.selectRecord(id)
	}
	/** Open the native middle column for a selected record. */
	selectRecord(id: string): void {
		this.selectedId.set(id)
		this.context.set(null)
		this.layout.set('TwoColumnsMidExpanded')
	}
	/** Return to the list using the FCL API, including on phones. */
	backToList(): void {
		this.layout.set('OneColumn')
		this.context.set(null)
	}
	/** Show a contextual record in the native end column. */
	openContext(value: { title: string; description: string }): void {
		this.context.set(value)
		this.layout.set('ThreeColumnsEndExpanded')
	}
	/** Close contextual detail while preserving the selected primary record. */
	closeContext(): void {
		this.context.set(null)
		this.layout.set('TwoColumnsMidExpanded')
	}
	/** Apply native ViewSettingsDialog sorting to each local data source. */
	sortRecords(descending: boolean): void {
		this.descending.set(descending)
		this.sortOpen.set(false)
	}
	/** Derive display initials for a fictional team member. */
	initials(name: string): string {
		return name
			.split(' ')
			.map(/** Take each name's first letter. */ (part) => part[0])
			.join('')
			.slice(0, 2)
	}
	/** Toggle a local follow preference without persisting user data. */
	toggle(value: boolean): boolean {
		return !value
	}
	/** Open contextual project information selected through the native menu. */
	projectAction(label: string): void {
		this.menuOpen.set(false)
		this.openContext({
			title: label,
			description: this.selectedProject().name + ' · Local project planning preview.',
		})
	}
	/** Require dates before presenting a disposable request summary. */
	previewRequest(): void {
		if (!this.request().dates.trim()) {
			this.requestError.set('Choose a leave date range.')
			return
		}
		this.requestError.set('')
		this.requestOpen.set(false)
		this.openContext({
			title: 'Draft leave request',
			description: this.request().dates + ' · ' + (this.request().notes || 'No notes'),
		})
	}
}
