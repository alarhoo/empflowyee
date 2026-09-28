import { describe, expect, it } from 'vitest'
import {
	CHART_CARD_HEIGHT,
	CHART_CARD_WIDTH,
	layoutHierarchy,
	type HierarchyChartNode,
} from './hierarchy-layout'

/** Build isolated layout data with explicit visible children. */
function node(id: string, children: HierarchyChartNode[] = []): HierarchyChartNode {
	return {
		id,
		title: id,
		subtitle: '',
		initials: '',
		count: children.length,
		expanded: true,
		hasMore: false,
		children,
	}
}

describe('hierarchy layout', /** Verify topology, dimensions and bounded paging-sized layouts. */ () => {
	it('connects reports only to their manager, preserving independent roots', /** A forest must not fabricate a common manager. */ () => {
		const result = layoutHierarchy([node('a', [node('b', [node('c')])]), node('d')])
		expect(
			result.nodes.map(
				/** Extract reported relationships. */ (item) => [item.data.id, item.manager],
			),
		).toEqual([
			['a', null],
			['d', null],
			['b', 'a'],
			['c', 'b'],
		])
		expect(result.links.map(/** Identify real edges only. */ (link) => link.id)).toEqual(['b', 'c'])
	})
	it('keeps a page of reports apart and inside the canvas', /** Fifty reports must not overlap or escape the local scroll extent. */ () => {
		const result = layoutHierarchy([
			node(
				'manager',
				Array.from(
					{ length: 50 },
					/** One page of reports. */ (_, index) => node(`report-${index}`),
				),
			),
		])
		const children = result.nodes.filter(
			/** Inspect the report row. */ (item) => item.manager === 'manager',
		)
		for (let index = 1; index < children.length; index++)
			expect(children[index].x - children[index - 1].x).toBeGreaterThan(CHART_CARD_WIDTH)
		for (const item of result.nodes) {
			expect(item.x).toBeGreaterThanOrEqual(0)
			expect(item.x + CHART_CARD_WIDTH).toBeLessThanOrEqual(result.width)
			expect(item.y + CHART_CARD_HEIGHT).toBeLessThanOrEqual(result.height)
		}
	})
	it('removes collapsed descendants without changing input data', /** Reflow must neither mutate the feature state nor leave orphan connectors. */ () => {
		const roots = [node('a', [node('b')])]
		const before = structuredClone(roots)
		layoutHierarchy(roots)
		expect(roots).toEqual(before)
		expect(layoutHierarchy([node('a')]).links).toEqual([])
		expect(layoutHierarchy([]).nodes).toEqual([])
	})
})
