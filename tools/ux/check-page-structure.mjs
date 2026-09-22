import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import ts from 'typescript'
import { checkPageStructure } from './page-structure.mjs'

/** Collect maintained TypeScript sources, including inline Storybook consumer templates. */
function* sources(directory) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name)
		if (entry.isDirectory()) yield* sources(path)
		else if (/\.(ts|mts)$/.test(path) && !path.endsWith('.spec.ts')) yield path
	}
}

const templates = []
for (const file of [
	...sources('libs/hcm/web'),
	...sources('apps/hcm/web/src'),
	...sources('apps/hcm/web/.storybook'),
]) {
	const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
	/** Read literal Angular metadata without evaluating application code. */
	function visit(node) {
		if (
			ts.isDecorator(node) &&
			ts.isCallExpression(node.expression) &&
			node.expression.expression.getText(source) === 'Component'
		) {
			const metadata = node.expression.arguments[0]
			if (!metadata || !ts.isObjectLiteralExpression(metadata)) return
			const values = {}
			for (const property of metadata.properties) {
				if (ts.isPropertyAssignment(property) && ts.isStringLiteralLike(property.initializer)) {
					values[property.name.getText(source)] = property.initializer.text
				}
			}
			const templateFile = values.templateUrl ? join(dirname(file), values.templateUrl) : file
			const content = values.templateUrl ? readFileSync(templateFile, 'utf8') : values.template
			if (content !== undefined)
				templates.push({ file: templateFile, selector: values.selector ?? file, content })
		}
		ts.forEachChild(node, visit)
	}
	visit(source)
}
const problems = checkPageStructure(templates)
if (problems.length) {
	console.error(problems.join('\n'))
	process.exitCode = 1
} else console.log(`HCM page structure passed (${templates.length} component templates).`)
