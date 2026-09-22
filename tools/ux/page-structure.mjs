import { parseTemplate } from '@angular/compiler'

const pageTags = new Set([
	'ui5-page',
	'ui5-dynamic-page',
	'ef-hcm-object-page',
	'ef-hcm-dynamic-page',
])
const columnSlots = new Set(['startColumn', 'midColumn', 'endColumn'])

/** Traverse Angular control-flow blocks while preserving element ancestry. */
function* elements(nodes, ancestors = []) {
	for (const node of nodes ?? []) {
		if (typeof node.name === 'string' && node.attributes) {
			yield { node, ancestors }
			yield* elements(node.children, [...ancestors, node])
		} else {
			for (const key of [
				'children',
				'branches',
				'cases',
				'empty',
				'placeholder',
				'loading',
				'error',
			]) {
				const children = node[key]
				if (children) yield* elements(Array.isArray(children) ? children : [children], ancestors)
			}
		}
	}
}

/** Read a static native slot assignment from an Angular element. */
function slotOf(node) {
	return node.attributes.find(
		/** Locate the native slot contract. */ (attribute) => attribute.name === 'slot',
	)?.value
}

/** Check native page headers and require page-backed FCL columns, resolving local component hosts. */
export function checkPageStructure(templates) {
	const parsed = new Map()
	const problems = []
	for (const template of templates) {
		const result = parseTemplate(template.content, template.file)
		for (const error of result.errors ?? []) problems.push(`${template.file}: ${error.msg}`)
		parsed.set(template.selector, { ...template, nodes: result.nodes })
	}

	/** Resolve a component's page root without treating a nested card or form as a page. */
	function isPage(tag, seen = new Set()) {
		if (pageTags.has(tag)) return true
		if (seen.has(tag)) return false
		seen.add(tag)
		const template = parsed.get(tag)
		return (
			!!template &&
			[...elements(template.nodes)].some(
				/** Only root content may establish the host's page contract. */ ({ node, ancestors }) =>
					ancestors.length === 0 && isPage(node.name, new Set(seen)),
			)
		)
	}

	for (const template of parsed.values()) {
		for (const { node, ancestors } of elements(template.nodes)) {
			const expectedSlot = node.name === 'ui5-page' ? 'header' : 'titleArea'
			if (node.name === 'ui5-page' || node.name === 'ui5-dynamic-page') {
				const header = [...elements(node.children)].some(
					/** Require this page's own header, not one belonging to a nested page. */ (child) =>
						child.ancestors.length === 0 && slotOf(child.node) === expectedSlot,
				)
				if (!header) problems.push(`${template.file}: ${node.name} requires slot="${expectedSlot}"`)
			}
			if (
				columnSlots.has(slotOf(node)) &&
				ancestors.at(-1)?.name === 'ui5-flexible-column-layout' &&
				!isPage(node.name)
			) {
				problems.push(
					`${template.file}: ${slotOf(node)} must contain Page, DynamicPage or a page-backed component; found ${node.name}`,
				)
			}
		}
	}
	return problems
}
