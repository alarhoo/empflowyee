import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { ShellBarBranding } from '@fundamental-ngx/ui5-webcomponents-fiori/shell-bar-branding'
import { BusyIndicator } from '@fundamental-ngx/ui5-webcomponents/busy-indicator'
import { Avatar } from '@fundamental-ngx/ui5-webcomponents/avatar'
import { Bar } from '@fundamental-ngx/ui5-webcomponents/bar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Card } from '@fundamental-ngx/ui5-webcomponents/card'
import { CardHeader } from '@fundamental-ngx/ui5-webcomponents/card-header'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { ListItemStandard } from '@fundamental-ngx/ui5-webcomponents/list-item-standard'
import { List } from '@fundamental-ngx/ui5-webcomponents/list'
import { Menu } from '@fundamental-ngx/ui5-webcomponents/menu'
import { MenuItemGroup } from '@fundamental-ngx/ui5-webcomponents/menu-item-group'
import { MenuItem } from '@fundamental-ngx/ui5-webcomponents/menu-item'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { Page } from '@fundamental-ngx/ui5-webcomponents-fiori/page'
import { ResponsivePopover } from '@fundamental-ngx/ui5-webcomponents/responsive-popover'
import { ShellBar } from '@fundamental-ngx/ui5-webcomponents-fiori/shell-bar'
import { Tab } from '@fundamental-ngx/ui5-webcomponents/tab'
import { TabContainer } from '@fundamental-ngx/ui5-webcomponents/tab-container'
import { Tag } from '@fundamental-ngx/ui5-webcomponents/tag'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { Toast } from '@fundamental-ngx/ui5-webcomponents/toast'
import { HCM_THEMES } from '@empflowyee/hcm-web-ux-theme'
import { LabSettingsStore } from './lab-settings.store'
import { LabDemoComponent } from './lab-demo.component'
import { LabSettingsComponent } from './lab-settings.component'
import { LAB_CONTROL_COUNT } from './lab-coverage'
@Component({
	selector: 'ef-hcm-theme-lab',
	providers: [LabSettingsStore],
	imports: [
		BusyIndicator,
		ShellBarBranding,
		Avatar,
		Bar,
		Button,
		Card,
		CardHeader,
		Form,
		FormItem,
		Input,
		Label,
		ListItemStandard,
		List,
		Menu,
		MenuItem,
		MenuItemGroup,
		MessageStrip,
		Page,
		ResponsivePopover,
		ShellBar,
		Tab,
		TabContainer,
		Tag,
		Text,
		Title,
		Toast,
		LabDemoComponent,
		LabSettingsComponent,
	],
	templateUrl: './theme-lab.component.html',
	styleUrl: './lab.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeLabComponent {
	readonly settings = inject(LabSettingsStore)
	readonly themes = HCM_THEMES
	readonly mainTab = signal('home')
	readonly profileAnchor = signal<HTMLElement | null>(null)
	readonly notificationAnchor = signal<HTMLElement | null>(null)
	readonly toastOpen = signal(false)
	readonly navigation = signal<{ area: 'Employee' | 'Leave' | 'Projects'; query: string }>({
		area: 'Employee',
		query: '',
	})
	readonly controlCount = LAB_CONTROL_COUNT
	/** Ignore bubbled profile-tab events so nested section changes cannot reset the workspace. */
	selectMainTab(tab: string | null): void {
		if (tab) this.mainTab.set(tab)
	}
	/** Open an area from the landing page without recreating its native layout. */
	openArea(area: 'Employee' | 'Leave' | 'Projects'): void {
		this.mainTab.set('demo')
		this.navigation.set({ area, query: '' })
	}
	/** Route shell search to the relevant local demo and apply an employee query when supplied. */
	searchLab(value: string): void {
		const query = value.trim().toLowerCase()
		if (query === 'leave') this.openArea('Leave')
		else if (query === 'projects') this.openArea('Projects')
		else {
			this.openArea('Employee')
			this.navigation.set({ area: 'Employee', query: value })
		}
	}
	/** Use native profile-menu actions for settings and a session-information toast. */
	profileAction(label: string): void {
		this.profileAnchor.set(null)
		const theme = this.themes.find(
			/** Resolve a theme selected through the avatar menu. */ (preset) => preset.label === label,
		)
		if (theme) this.settings.selectTheme(theme.id)
		else if (label === 'Presentation settings') this.mainTab.set('settings')
		else this.toastOpen.set(true)
	}
}
