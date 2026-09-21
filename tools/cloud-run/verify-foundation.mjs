import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const catalog = JSON.parse(readFileSync('infra/terraform/cloud-run/service-catalog.json', 'utf8'))
const releases = JSON.parse(readFileSync('ci/deployables.json', 'utf8'))
const containers = JSON.parse(readFileSync('containers/deployables.json', 'utf8'))
const actual = Object.keys(catalog).sort()
assert.equal(actual.length, 7, 'Cloud Run must preserve the seven approved deployables')
assert.deepEqual(actual, Object.keys(releases.deployables).sort())
assert.equal(containers.deployables.length, actual.length)
for (const container of containers.deployables) {
	assert.equal(catalog[container.project]?.runtime, container.runtime)
}

for (const environment of ['dev', 'qa', 'prod']) {
	for (const file of [
		'main.tf',
		'variables.tf',
		'versions.tf',
		'providers.tf',
		'outputs.tf',
		'backend.hcl.example',
		'terraform.tfvars.example',
		'.terraform.lock.hcl',
		'tests/foundation.tftest.hcl',
		'tests/module.tftest.hcl',
	]) {
		const target = `infra/terraform/cloud-run/${environment}/${file}`
		assert.ok(existsSync(target), `Missing ${target}`)
	}
}

const deployment = readFileSync('.github/workflows/_reusable-deploy-cloud-run.yml', 'utf8')
assert.ok(
	deployment.replaceAll('\r\n', '\n').includes('group: cloud-run-${{ inputs.environment }}\n'),
)
console.log(
	'Cloud Run structure verified: seven matching deployables, locked/tested roots and environment deployment locks.',
)
console.log(
	'Run Terraform validate/test and a real DEV plan separately; this check does not inspect GCP.',
)
