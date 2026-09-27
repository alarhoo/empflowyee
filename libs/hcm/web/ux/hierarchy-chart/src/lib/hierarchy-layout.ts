import { hierarchy, tree } from 'd3-hierarchy'

/** Domain-neutral visible hierarchy; callers own loading, permissions and expansion. */
export interface HierarchyChartNode {
	id: string
	title: string
	subtitle: string
	initials: string
	count: number
	expanded: boolean
	state?: 'loading' | 'content' | 'error'
	hasMore: boolean
	children: HierarchyChartNode[]
}

export const CHART_CARD_WIDTH = 280
export const CHART_CARD_HEIGHT = 190
const LEVEL_GAP = 80
const MARGIN = 24

/** Position a forest without displaying or linking its synthetic common root. */
export function layoutHierarchy(nodes: HierarchyChartNode[]) {
	const virtual: HierarchyChartNode = {
		id: '',
		title: '',
		subtitle: '',
		initials: '',
		count: 0,
		expanded: true,
		hasMore: false,
		children: nodes,
	}
	const root = tree<HierarchyChartNode>().nodeSize([
		CHART_CARD_WIDTH + 32,
		CHART_CARD_HEIGHT + LEVEL_GAP,
	])(
		hierarchy(
			virtual,
			/** Only visible descendants participate in layout. */ (node) => node.children,
		),
	)
	const visible = root
		.descendants()
		.filter(/** Hide the synthetic root. */ (node) => node.depth > 0)
	const min = Math.min(0, ...visible.map(/** Find the left edge. */ (node) => node.x))
	const max = Math.max(0, ...visible.map(/** Find the right edge. */ (node) => node.x))
	const positioned = visible.map(
		/** Translate each card into positive canvas coordinates. */ (node) => ({
			data: node.data,
			x: node.x - min + MARGIN,
			y: (node.depth - 1) * (CHART_CARD_HEIGHT + LEVEL_GAP) + MARGIN,
			manager: node.parent?.depth ? node.parent.data.title : null,
		}),
	)
	const links = root
		.links()
		.filter(/** Independent roots have no connecting line. */ (link) => link.source.depth > 0)
		.map(
			/** Route an orthogonal manager-to-report connector between card edges. */ ({
				source,
				target,
			}) => {
				const x1 = source.x - min + MARGIN + CHART_CARD_WIDTH / 2
				const y1 = (source.depth - 1) * (CHART_CARD_HEIGHT + LEVEL_GAP) + MARGIN + CHART_CARD_HEIGHT
				const x2 = target.x - min + MARGIN + CHART_CARD_WIDTH / 2
				const y2 = (target.depth - 1) * (CHART_CARD_HEIGHT + LEVEL_GAP) + MARGIN
				return { id: target.data.id, path: `M${x1},${y1} V${y1 + LEVEL_GAP / 2} H${x2} V${y2}` }
			},
		)
	return {
		nodes: positioned,
		links,
		width: max - min + CHART_CARD_WIDTH + MARGIN * 2,
		height:
			Math.max(
				CHART_CARD_HEIGHT,
				...positioned.map(
					/** Include the last card's full height. */ (node) => node.y + CHART_CARD_HEIGHT,
				),
			) + MARGIN,
	}
}
