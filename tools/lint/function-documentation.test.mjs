import assert from 'node:assert/strict'
import test from 'node:test'
import { Linter } from 'eslint'
import jsdoc from 'eslint-plugin-jsdoc'
import tseslint from 'typescript-eslint'
import baseConfig, { sharedRules } from '../../eslint.config.mjs'

const settings = baseConfig.find(
	/** Reuse the shared documentation exemptions so the test detects policy drift. */
	(config) => config.settings?.jsdoc,
).settings
const config = {
	languageOptions: { parser: tseslint.parser },
	plugins: { jsdoc },
	settings,
	rules: {
		'jsdoc/require-jsdoc': sharedRules['jsdoc/require-jsdoc'],
		'jsdoc/require-description': sharedRules['jsdoc/require-description'],
	},
}
const linter = new Linter()

// Undocumented functions below are deliberate negative fixtures for the lint policy.
const implementations = [
	['declaration', 'function read() {}', '/** Read the current value. */ function read() {}'],
	[
		'export',
		'export function read() {}',
		'/** Read the public value. */ export function read() {}',
	],
	['arrow', 'const read = () => 1', '/** Read the current value. */ const read = () => 1'],
	[
		'callback',
		'items.map((item) => item.id)',
		'items.map(/** Extract the item identifier. */ (item) => item.id)',
	],
	[
		'function expression',
		'consume(function read() {})',
		'consume(/** Read the consumed item. */ function read() {})',
	],
	[
		'nested function',
		'/** Create a reader. */ function outer() { return () => 1 }',
		'/** Create a reader. */ function outer() { return /** Read the captured value. */ () => 1 }',
	],
	[
		'method',
		'class Reader { read() {} }',
		'class Reader { /** Read the current value. */ read() {} }',
	],
	[
		'constructor',
		'class Reader { constructor() {} }',
		'class Reader { /** Initialize the reader. */ constructor() {} }',
	],
	[
		'getter',
		'class Reader { get value() { return 1 } }',
		'class Reader { /** Read the stored value. */ get value() { return 1 } }',
	],
	[
		'setter',
		'class Reader { set value(value) {} }',
		'class Reader { /** Accept a replacement value. */ set value(value) {} }',
	],
	[
		'decorated method',
		'class Controller { @Get() read() {} }',
		'class Controller { /** Serve the greeting endpoint. */ @Get() read() {} }',
	],
	[
		'injected constructor',
		'class Controller { constructor(private readonly service: Service) {} }',
		'class Controller { /** Receive the injected application service. */ constructor(private readonly service: Service) {} }',
	],
	[
		'object method',
		'const reader = { read() {} }',
		'const reader = { /** Read the current value. */ read() {} }',
	],
	[
		'class field arrow',
		'class Reader { read = () => 1 }',
		'class Reader { /** Read the current value. */ read = () => 1 }',
	],
	[
		'test callback',
		"test('works', () => {})",
		"test('works', /** Verify the expected result. */ () => {})",
	],
]

for (const [kind, undocumented, documented] of implementations) {
	test(`${kind} requires a purpose comment`, /** Verify missing documentation fails and a purpose comment satisfies the shared rules. */ () => {
		const errors = linter.verify(undocumented, config)
		assert.ok(
			errors.some(
				/** Identify a missing-comment error rather than an unrelated parser failure. */
				(error) => error.ruleId === 'jsdoc/require-jsdoc' && error.severity === 2,
			),
			JSON.stringify(errors),
		)
		assert.deepEqual(linter.verify(documented, config), [])
	})
}

test('empty blocks and documentation escape tags cannot replace a description', /** Verify comments need prose even when an exemption tag or empty block is present. */ () => {
	for (const comment of ['/** */', '/** @inheritdoc */', '/** @override */', '/** @ignore */']) {
		const errors = linter.verify(`${comment} function read() {}`, config)
		assert.ok(
			errors.some(
				/** Identify the required-description error for the empty documentation fixture. */
				(error) => error.ruleId === 'jsdoc/require-description' && error.severity === 2,
			),
			JSON.stringify(errors),
		)
	}
	assert.equal(linter.verifyAndFix('function read() {}', config).fixed, false)
})
