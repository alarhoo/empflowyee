import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core'
import { FormField, form } from '@angular/forms/signals'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { List } from '@fundamental-ngx/ui5-webcomponents/list'
import { ListItemGroup } from '@fundamental-ngx/ui5-webcomponents/list-item-group'
import { ListItemStandard } from '@fundamental-ngx/ui5-webcomponents/list-item-standard'
import type { PermissionOption, PermissionKind } from '@empflowyee/hcm-access-control-contract'

@Component({
	selector: 'ef-hcm-role-permissions',
	imports: [Text, Input, List, ListItemGroup, ListItemStandard, FormField],
	templateUrl: './role-permissions.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RolePermissionsComponent {
	readonly options = input.required<PermissionOption[]>()
	readonly selected = model<string[]>([])
	readonly readOnly = input(false)
	readonly search = signal({ q: '' })
	readonly searchForm = form(this.search)
	readonly groups: readonly { kind: PermissionKind; label: string }[] = [
		{ kind: 'business-operation', label: 'Business operations' },
		{ kind: 'catalogue-discovery', label: 'Launchpad discovery' },
	]
	readonly visible = computed(
		/** Filter API-owned option descriptions locally without changing their grants. */ () => {
			const q = this.search().q.toLocaleLowerCase()
			return this.options().filter(
				/** Match exact code and description for selection usability. */ (option) =>
					`${option.code} ${option.description}`.toLocaleLowerCase().includes(q) &&
					(!this.readOnly() || this.selected().includes(option.code)),
			)
		},
	)
	/** Toggle only a registered code; runtime APIs remain the authorization boundary. */
	toggle(code: string, checked: boolean): void {
		if (
			this.readOnly() ||
			!this.options().some(
				/** Accept only a registered permission row. */ (option) => option.code === code,
			)
		)
			return
		if (checked)
			this.selected.update(
				/** Add only one occurrence of the selected registered code. */ (values) =>
					[...new Set([...values, code])].sort(),
			)
		else
			this.selected.update(
				/** Remove only the selected registered code. */ (values) =>
					values.filter(/** Keep other selections unchanged. */ (value) => value !== code),
			)
	}
}
