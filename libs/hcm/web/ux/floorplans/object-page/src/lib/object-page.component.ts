import { FlexibleColumnLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout'
import '@ui5/webcomponents-icons/dist/full-screen.js'
import '@ui5/webcomponents-icons/dist/exit-full-screen.js'
import '@ui5/webcomponents-icons/dist/decline.js'
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	signal,
	contentChildren,
	input,
	output,
} from '@angular/core'
import { NgTemplateOutlet } from '@angular/common'
import { DynamicPage } from '@fundamental-ngx/ui5-webcomponents-fiori/dynamic-page'
import { DynamicPageTitle } from '@fundamental-ngx/ui5-webcomponents-fiori/dynamic-page-title'
import { DynamicPageHeader } from '@fundamental-ngx/ui5-webcomponents-fiori/dynamic-page-header'
import { TabContainer } from '@fundamental-ngx/ui5-webcomponents/tab-container'
import { Tab } from '@fundamental-ngx/ui5-webcomponents/tab'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Toolbar } from '@fundamental-ngx/ui5-webcomponents/toolbar'
import { ToolbarButton } from '@fundamental-ngx/ui5-webcomponents/toolbar-button'
import { BusyIndicator } from '@fundamental-ngx/ui5-webcomponents/busy-indicator'
import { IllustratedMessage } from '@fundamental-ngx/ui5-webcomponents-fiori/illustrated-message'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import '@ui5/webcomponents-fiori/dist/illustrations/NoData.js'
import '@ui5/webcomponents-fiori/dist/illustrations/UnableToLoad.js'
import '@ui5/webcomponents-fiori/dist/illustrations/tnt/Lock.js'
import { HcmObjectSection } from './object-section.directive'

export interface HcmObjectAction {
	id: string
	label: string
	icon?: string
	mutates?: boolean
	emphasized?: boolean
	disabled?: boolean
}

/** Compose native UI5 DynamicPage and tabs into a reusable, domain-agnostic object detail floorplan. */
@Component({
	standalone: true,
	selector: 'ef-hcm-object-page',
	imports: [
		DynamicPage,
		DynamicPageTitle,
		DynamicPageHeader,
		TabContainer,
		Tab,
		Button,
		Title,
		Text,
		Toolbar,
		ToolbarButton,
		NgTemplateOutlet,
		BusyIndicator,
		IllustratedMessage,
		MessageStrip,
	],
	templateUrl: './object-page.component.html',
	styleUrl: './object-page.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HcmObjectPage {
	readonly columns = inject(FlexibleColumnLayout, { optional: true })
	readonly maximized = signal(false)
	/** FCL column hosting this detail; an end-column detail expands within a three-column layout. */
	readonly column = input<'mid' | 'end'>('mid')
	/** Expand the native detail column or restore its list/detail split. */
	toggleMaximized(): void {
		if (!this.columns) return
		this.maximized.update(/** Toggle the selected detail's presentation only. */ (value) => !value)
		const end = this.column() === 'end'
		if (this.maximized())
			this.columns.elementRef.nativeElement.layout = end
				? 'EndColumnFullScreen'
				: 'MidColumnFullScreen'
		else
			this.columns.elementRef.nativeElement.layout = end
				? 'ThreeColumnsEndExpanded'
				: 'TwoColumnsMidExpanded'
	}

	readonly title = input.required<string>()
	readonly summary = input('')
	readonly state = input<'content' | 'loading' | 'empty' | 'error' | 'denied' | 'unavailable'>(
		'content',
	)
	readonly readOnly = input(false)
	readonly showFooter = input(false)
	readonly actions = input<readonly HcmObjectAction[]>([])
	readonly errorMessage = input('This object could not be loaded. Try again.')
	readonly action = output<string>()
	readonly retry = output<void>()
	readonly sectionChange = output<string>()
	readonly sections = contentChildren(HcmObjectSection)
	readonly navigationAction = computed(
		/** Separate closing a detail column from business commands such as closing a review. */ () =>
			this.actions().find(
				/** Identify only a non-mutating return action. */ (item) =>
					!item.mutates && (item.id === 'back' || item.id === 'close'),
			),
	)
	/** Delegate closing to the feature so its route and dirty-state policy remain authoritative. */
	closeDetail(): void {
		const item = this.navigationAction()
		if (item) this.action.emit(item.id)
	}
	readonly visibleActions = computed(
		/** Keep non-mutating object actions available to read-only users. */ () =>
			this.actions().filter(
				/** Hide only actions explicitly marked as mutations. */ (item) =>
					(item !== this.navigationAction() || !this.columns) &&
					(!item.mutates || (!this.readOnly() && this.state() === 'content')),
			),
	)
}
