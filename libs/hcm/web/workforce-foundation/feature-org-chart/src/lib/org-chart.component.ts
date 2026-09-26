import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	effect,
	inject,
	signal,
	untracked,
} from '@angular/core'
import { NgTemplateOutlet } from '@angular/common'
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { filter, forkJoin, map, of, type Subscription } from 'rxjs'
import { FlexibleColumnLayout } from '@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout'
import { Form } from '@fundamental-ngx/ui5-webcomponents/form'
import { FormItem } from '@fundamental-ngx/ui5-webcomponents/form-item'
import { Label } from '@fundamental-ngx/ui5-webcomponents/label'
import { Input } from '@fundamental-ngx/ui5-webcomponents/input'
import { Button } from '@fundamental-ngx/ui5-webcomponents/button'
import { MessageStrip } from '@fundamental-ngx/ui5-webcomponents/message-strip'
import { List } from '@fundamental-ngx/ui5-webcomponents/list'
import { ListItemStandard } from '@fundamental-ngx/ui5-webcomponents/list-item-standard'
import { Tree } from '@fundamental-ngx/ui5-webcomponents/tree'
import { TreeItem } from '@fundamental-ngx/ui5-webcomponents/tree-item'
import { HcmDynamicPage, type HcmPageState } from '@empflowyee/hcm-web-ux-floorplan-dynamic-page'
import { HcmRuntimeStore } from '@empflowyee/hcm-web-runtime-context'
import {
	OrgChartApi,
	structureDenied,
	structureErrorMessage,
} from '@empflowyee/hcm-web-workforce-foundation-data-access'
import type { OrgChartNodeDto } from '@empflowyee/hcm-workforce-foundation-contract'
import { PersonDetailComponent } from './person-detail.component'
import { nodeName, nodeSubtitle } from './node-label'

interface Branch {
	items: OrgChartNodeDto[]
	cursor: string | null
	state: 'loading' | 'content' | 'error'
}

/** Org Chart: native FCL of the reporting tree and one person's organisation-visible details. */
@Component({
	selector: 'ef-hcm-org-chart',
	imports: [
		NgTemplateOutlet,
		FlexibleColumnLayout,
		Form,
		FormItem,
		Label,
		Input,
		Button,
		MessageStrip,
		List,
		ListItemStandard,
		Tree,
		TreeItem,
		HcmDynamicPage,
		PersonDetailComponent,
	],
	templateUrl: './org-chart.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrgChartComponent {
	private readonly router = inject(Router)
	private readonly route = inject(ActivatedRoute)
	private readonly runtime = inject(HcmRuntimeStore)
	private readonly api = inject(OrgChartApi)
	private readonly destroy = inject(DestroyRef)
	private request?: Subscription
	private searchRequest?: Subscription
	readonly name = nodeName
	readonly subtitle = nodeSubtitle
	readonly selectedId = toSignal(
		this.router.events.pipe(
			filter(/** Completed navigations only. */ (event) => event instanceof NavigationEnd),
			map(/** Read the child segment. */ () => this.childId()),
		),
		{ initialValue: this.childId() },
	)
	readonly state = signal<HcmPageState>('loading')
	readonly message = signal('')
	readonly roots = signal<OrgChartNodeDto[]>([])
	readonly rootCursor = signal<string | null>(null)
	readonly branches = signal<Record<string, Branch>>({})
	readonly expanded = signal<ReadonlySet<string>>(new Set())
	readonly query = signal('')
	readonly results = signal<OrgChartNodeDto[] | null>(null)
	readonly resultCursor = signal<string | null>(null)
	readonly searching = signal(false)
	readonly searchMessage = signal('')
	readonly layout = computed(
		/** Show the detail column only for a selected person. */ () =>
			this.selectedId() ? 'TwoColumnsMidExpanded' : 'OneColumn',
	)

	/** Reload the tree when the verified context changes. */
	constructor() {
		effect(
			/** Track the context that defines the chart. */ () => {
				const context = this.runtime.context()
				untracked(
					/** Clear prior-context state before loading. */ () => {
						this.request?.unsubscribe()
						this.searchRequest?.unsubscribe()
						this.roots.set([])
						this.branches.set({})
						this.expanded.set(new Set())
						this.results.set(null)
						if (context) this.load()
					},
				)
			},
		)
		this.destroy.onDestroy(
			/** Cancel in-flight reads. */ () => {
				this.request?.unsubscribe()
				this.searchRequest?.unsubscribe()
			},
		)
	}

	/** Read the selected assignment from the child route segment. */
	private childId(): string | null {
		return this.route.snapshot.firstChild?.paramMap.get('assignmentId') ?? null
	}

	/** Load the first page of roots, then reveal a deep-linked selection. */
	load(): void {
		this.state.set('loading')
		this.message.set('')
		this.request = this.api
			.roots()
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the roots. */ (page) => {
					this.roots.set(page.items)
					this.rootCursor.set(page.nextCursor)
					this.state.set('content')
					const selected = this.selectedId()
					if (selected) this.reveal(selected)
				},
				error: /** Distinguish denial from temporary failure. */ (error) => {
					this.message.set(structureErrorMessage(error))
					this.state.set(structureDenied(error) ? 'denied' : 'error')
				},
			})
	}

	/** Load the next page of roots. */
	moreRoots(): void {
		const cursor = this.rootCursor()
		if (!cursor) return
		this.api
			.roots(cursor)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Append the page. */ (page) => {
					this.roots.update(/** Append. */ (rows) => [...rows, ...page.items])
					this.rootCursor.set(page.nextCursor)
				},
				error: /** Keep the loaded roots. */ (error) =>
					this.message.set(structureErrorMessage(error)),
			})
	}

	/** Expand or collapse a node, loading its reports on first expansion. */
	toggle(item: HTMLElement | null): void {
		const id = item?.dataset['id']
		if (!id) return
		const open = new Set(this.expanded())
		if (open.has(id)) open.delete(id)
		else {
			open.add(id)
			if (!this.branches()[id]) this.loadReports(id, false)
		}
		this.expanded.set(open)
	}

	/** Load one page of a node's direct reports. */
	loadReports(id: string, append: boolean): void {
		const existing = this.branches()[id]
		this.setBranch(id, {
			items: append ? (existing?.items ?? []) : [],
			cursor: existing?.cursor ?? null,
			state: 'loading',
		})
		this.api
			.reports(id, append ? existing?.cursor : null)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Append the reports under their manager. */ (page) =>
					this.setBranch(id, {
						items: [...(append ? (existing?.items ?? []) : []), ...page.items],
						cursor: page.nextCursor,
						state: 'content',
					}),
				error: /** Keep a failed branch retryable. */ () =>
					this.setBranch(id, {
						items: existing?.items ?? [],
						cursor: existing?.cursor ?? null,
						state: 'error',
					}),
			})
	}

	/** Replace one branch immutably. */
	private setBranch(id: string, branch: Branch): void {
		this.branches.update(/** Replace one entry. */ (all) => ({ ...all, [id]: branch }))
	}

	/** Select a node, or load more or retry reports from a service item. */
	treeClick(item: HTMLElement | null): void {
		const more = item?.dataset['more']
		if (more === 'roots') {
			this.moreRoots()
			return
		}
		if (more) {
			this.loadReports(more, this.branches()[more]?.state !== 'error')
			return
		}
		const id = item?.dataset['id']
		if (id) this.select(id)
	}

	/** Open a person in the mid column; the opaque id stays one encoded path segment. */
	select(id: string): void {
		const base = this.router.serializeUrl(
			this.router.createUrlTree(['.'], { relativeTo: this.route }),
		)
		void this.router.navigateByUrl(`${base}/${encodeURIComponent(id)}`)
	}

	/** Close the mid column. */
	close(): void {
		void this.router.navigate(['.'], { relativeTo: this.route })
	}

	/** Run a search of at least two characters. */
	search(more = false): void {
		const q = this.query().trim()
		this.searchMessage.set('')
		if (!more && q.length < 2) {
			this.results.set(null)
			if (q) this.searchMessage.set('Enter at least two characters.')
			return
		}
		this.searching.set(true)
		this.searchRequest?.unsubscribe()
		this.searchRequest = this.api
			.search(q, more ? this.resultCursor() : null)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Publish the results. */ (page) => {
					this.results.update(
						/** Append on more. */ (rows) => (more ? [...(rows ?? []), ...page.items] : page.items),
					)
					this.resultCursor.set(page.nextCursor)
					this.searching.set(false)
				},
				error: /** Report the failure without stale results. */ (error) => {
					this.searching.set(false)
					this.searchMessage.set(structureErrorMessage(error))
				},
			})
	}

	/** Update the search text. */
	setQuery(target: EventTarget | null): void {
		this.query.set((target as HTMLInputElement | null)?.value ?? '')
		if (!this.query().trim()) this.results.set(null)
	}

	/** Choose a search result: reveal its path in the tree and select it. */
	chooseResult(item: HTMLElement | null): void {
		const id = item?.dataset['id']
		if (!id) return
		this.results.set(null)
		this.query.set('')
		this.select(id)
		this.reveal(id)
	}

	/** The first page of a node's reports, unless its branch is already loaded. */
	private firstReports(id: string) {
		if (this.branches()[id]) return of(null)
		return this.api.reports(id).pipe(map(/** Tag with its manager. */ (page) => ({ id, page })))
	}

	/** Expand the ancestors of a node so it is visible in the tree. */
	private reveal(id: string): void {
		this.api
			.path(id)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: /** Load each ancestor's reports and keep the path node visible. */ (path) => {
					const ancestors = path.items.slice(0, -1)
					if (!ancestors.length) return
					const open = new Set(this.expanded())
					for (const node of ancestors) open.add(node.assignmentId)
					this.expanded.set(open)
					forkJoin(
						ancestors.map(/** Each ancestor. */ (node) => this.firstReports(node.assignmentId)),
					)
						.pipe(takeUntilDestroyed(this.destroy))
						.subscribe({
							next: /** Publish branches, keeping the next path node present. */ (pages) =>
								pages.forEach(
									/** One ancestor. */ (entry, index) => {
										if (!entry) return
										const child = path.items[index + 1]
										const items = entry.page.items
										const present =
											!child ||
											items.some(/** Match. */ (n) => n.assignmentId === child.assignmentId)
										this.setBranch(entry.id, {
											items: present ? items : [...items, child],
											cursor: entry.page.nextCursor,
											state: 'content',
										})
									},
								),
							error: /** Leave the tree as it is. */ () => undefined,
						})
				},
				error: /** A broken or cyclic path is reported safely. */ (error) =>
					this.searchMessage.set(structureErrorMessage(error)),
			})
	}
}
