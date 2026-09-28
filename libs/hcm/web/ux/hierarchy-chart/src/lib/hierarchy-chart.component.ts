import {
	afterRenderEffect,
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	computed,
	ElementRef,
	DestroyRef,
	inject,
	input,
	output,
	signal,
	viewChild,
} from '@angular/core'
import { Card } from '@fundamental-ngx/ui5-webcomponents/card'
import { CardHeader } from '@fundamental-ngx/ui5-webcomponents/card-header'
import { Avatar } from '@fundamental-ngx/ui5-webcomponents/avatar'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { Text } from '@fundamental-ngx/ui5-webcomponents/text'
import { Title } from '@fundamental-ngx/ui5-webcomponents/title'
import { Toolbar } from '@fundamental-ngx/ui5-webcomponents/toolbar'
import { ToolbarButton } from '@fundamental-ngx/ui5-webcomponents/toolbar-button'
import { ToolbarItem } from '@fundamental-ngx/ui5-webcomponents/toolbar-item'
import {
	CHART_CARD_HEIGHT,
	CHART_CARD_WIDTH,
	layoutHierarchy,
	type HierarchyChartNode,
} from './hierarchy-layout'

/** Shared connected hierarchy composition: D3 coordinates with native UI5 controls. */
@Component({
	selector: 'ef-hcm-hierarchy-chart',
	imports: [Card, CardHeader, Avatar, Button, Text, Title, Toolbar, ToolbarButton, ToolbarItem],
	templateUrl: './hierarchy-chart.component.html',
	styleUrl: './hierarchy-chart.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HcmHierarchyChart {
	readonly nodes = input.required<HierarchyChartNode[]>()
	readonly selectedId = input<string | null>(null)
	readonly selected = output<string>()
	readonly toggled = output<string>()
	readonly more = output<string>()
	readonly zoom = signal(1)
	readonly percent = computed(
		/** Expose scale as readable text. */ () => Math.round(this.zoom() * 100),
	)
	readonly layout = computed(
		/** Reflow only the loaded visible forest. */ () => layoutHierarchy(this.nodes()),
	)
	readonly cardWidth = CHART_CARD_WIDTH
	readonly cardHeight = CHART_CARD_HEIGHT
	private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport')
	private readonly anchor = signal<string | null>(null)
	private readonly destroy = inject(DestroyRef)

	/** Keep selected or expanded nodes in the local viewport after layout changes. */
	constructor() {
		afterNextRender(
			/** Keep the current branch visible when native FCL columns resize. */ () => {
				const viewport = this.viewport()?.nativeElement
				if (!viewport) return
				const observer = new ResizeObserver(
					/** Recenter after a responsive width change. */ () => this.center(),
				)
				observer.observe(viewport)
				this.destroy.onDestroy(
					/** Release the local resize observer. */ () => observer.disconnect(),
				)
			},
		)
		afterRenderEffect(
			/** Position after Angular has updated scaled canvas dimensions. */ () => {
				this.layout()
				this.zoom()
				this.selectedId()
				this.center()
			},
		)
	}

	/** Toggle a branch while keeping its manager in view. */
	toggle(id: string): void {
		this.anchor.set(id)
		this.toggled.emit(id)
	}

	/** Bound explicit zoom without taking over browser zoom or wheel gestures. */
	changeZoom(delta: number): void {
		this.zoom.update(
			/** Apply one zoom step. */ (value) => Math.max(0.1, Math.min(1.5, value + delta)),
		)
	}

	/** Fit the loaded diagram to the available local canvas. */
	fit(): void {
		const viewport = this.viewport()?.nativeElement
		if (!viewport) return
		this.zoom.set(
			Math.min(
				1,
				(viewport.clientWidth - 16) / this.layout().width,
				(viewport.clientHeight - 16) / this.layout().height,
			),
		)
		viewport.scrollTo({ left: 0, top: 0 })
	}

	/** Restore readable full-size cards and center the selected branch. */
	reset(): void {
		this.zoom.set(1)
		this.center()
	}

	/** Scroll only this diagram, preserving the enclosing page's position. */
	private center(): void {
		const viewport = this.viewport()?.nativeElement
		const nodes = this.layout().nodes
		const id = this.selectedId() ?? this.anchor()
		const node =
			nodes.find(/** Locate the current context. */ (item) => item.data.id === id) ??
			nodes.find(
				/** Initially show the first real connection, including on phones. */ (item) =>
					item.data.expanded && item.data.count > 0,
			) ??
			nodes[0]
		if (!viewport || !node) return
		viewport.scrollTo({
			left: (node.x + this.cardWidth / 2) * this.zoom() - viewport.clientWidth / 2,
			top: Math.max(0, node.y * this.zoom() - 24),
		})
	}
}
