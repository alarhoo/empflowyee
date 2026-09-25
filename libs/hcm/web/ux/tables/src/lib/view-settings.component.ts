import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core'
import { Toolbar } from '@fundamental-ngx/ui5-webcomponents/toolbar'
import { ToolbarButton } from '@fundamental-ngx/ui5-webcomponents/toolbar-button'
import { ToolbarSpacer } from '@fundamental-ngx/ui5-webcomponents/toolbar-spacer'
import { ViewSettingsDialog } from '@fundamental-ngx/ui5-webcomponents-fiori/view-settings-dialog'
import { SortItem } from '@fundamental-ngx/ui5-webcomponents-fiori/sort-item'
import '@ui5/webcomponents-icons/dist/sort.js'

/** Present native sorting controls; the consuming feature owns query execution and paging. */
@Component({
	selector: 'ef-hcm-view-settings',
	imports: [Toolbar, ToolbarButton, ToolbarSpacer, ViewSettingsDialog, SortItem],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<ui5-toolbar [accessibleName]="label() + ' toolbar'" design="Transparent">
			<ng-content></ng-content>
			<ui5-toolbar-spacer></ui5-toolbar-spacer>
			<ui5-toolbar-button
				icon="sort"
				text="Sort"
				[accessibleName]="label() + ' view settings'"
				[disabled]="disabled()"
				(ui5Click)="open.set(true)"
			></ui5-toolbar-button>
		</ui5-toolbar>
		@if (open()) {
			<ui5-view-settings-dialog
				[open]="true"
				[sortDescending]="value().endsWith(':desc')"
				(ui5Confirm)="
					confirm($event.detail.sortByItem.getAttribute('data-field'), $event.detail.sortDescending)
				"
				(ui5Close)="open.set(false)"
			>
				@for (field of fields(); track field.key) {
					<ui5-sort-item
						slot="sortItems"
						[attr.data-field]="field.key"
						[text]="field.label"
						[selected]="value().split(':')[0] === field.key"
					></ui5-sort-item>
				}
			</ui5-view-settings-dialog>
		}
	`,
})
export class HcmViewSettings {
	readonly label = input.required<string>()
	readonly value = input.required<string>()
	readonly fields = input.required<readonly { key: string; label: string }[]>()
	readonly disabled = input(false)
	readonly sortChange = output<string>()
	readonly open = signal(false)
	/** Emit only a declared sort field; cancellation never modifies the current query. */
	confirm(field: string | null | undefined, descending: boolean): void {
		if (
			this.disabled() ||
			!this.fields().some(
				/** Validate native event metadata against the declared columns. */ (item) =>
					item.key === field,
			)
		)
			return
		this.sortChange.emit(`${field}:${descending ? 'desc' : 'asc'}`)
		this.open.set(false)
	}
}
