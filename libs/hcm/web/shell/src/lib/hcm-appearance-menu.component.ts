import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core'
import { Menu } from '@fundamental-ngx/ui5-webcomponents/menu'
import { MenuItem } from '@fundamental-ngx/ui5-webcomponents/menu-item'
import { MenuItemGroup } from '@fundamental-ngx/ui5-webcomponents/menu-item-group'
import { HCM_THEMES, HcmAppearanceService, HcmThemeService } from '@empflowyee/hcm-web-ux-theme'

@Component({
	selector: 'ef-hcm-appearance-menu',
	imports: [Menu, MenuItem, MenuItemGroup],
	templateUrl: './hcm-appearance-menu.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HcmAppearanceMenuComponent {
	readonly open = input(false)
	readonly opener = input<HTMLElement | null>(null)
	readonly closed = output<void>()
	readonly appearance = inject(HcmAppearanceService)
	readonly theme = inject(HcmThemeService)
	readonly themes = HCM_THEMES
}
