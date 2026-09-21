import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync('ci/deployables.json', 'utf8'))
const expected = [
	'marketing-web',
	'account-web',
	'account-api',
	'hcm-web',
	'hcm-api',
	'console-web',
	'console-api',
]
assert.deepEqual(
	Object.keys(manifest.deployables).sort(),
	expected.sort(),
	'Expected exactly seven deployables',
)

for (const [name, config] of Object.entries(manifest.deployables)) {
	const [product, runtime] = name.split('-')
	assert.deepEqual(
		config,
		{
			product,
			runtime,
			dockerfile: `apps/${product}/${runtime}/Dockerfile`,
			context: '.',
			image: name,
			service: name,
		},
		`Unexpected manifest configuration for ${name}`,
	)
	const project = JSON.parse(readFileSync(`apps/${product}/${runtime}/project.json`, 'utf8'))
	assert.equal(project.name, name)
	assert.equal(project.projectType, 'application')
	for (const tag of [`product:${product}`, `runtime:${runtime}`, 'type:app']) {
		assert.ok(project.tags.includes(tag), `${name} is missing ${tag}`)
	}
}

console.log(`Deployable manifest OK: ${expected.length} deployables.`)
