import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { releaseMatrix } from './build-release-matrix.mjs'

const manifest = JSON.parse(
	readFileSync(new URL('../../ci/deployables.json', import.meta.url), 'utf8'),
)

test('empty or library-only changes select no deployables', /** Verify that empty input, libraries and inherited object keys cannot schedule releases. */ () => {
	assert.deepEqual(releaseMatrix(manifest, ''), { include: [] })
	assert.deepEqual(releaseMatrix(manifest, 'hcm-leave-contract,hcm-web-e2e,__proto__'), {
		include: [],
	})
})

test('filters and deduplicates affected apps', /** Verify that only deployable apps remain and duplicate project names run once. */ () => {
	assert.deepEqual(releaseMatrix(manifest, 'hcm-web, hcm-web,account-api,hcm-web-e2e'), {
		include: [{ project: 'hcm-web' }, { project: 'account-api' }],
	})
})

test('full releases select all seven deployables', /** Verify that a full release includes every deployable in the manifest. */ () => {
	assert.equal(
		releaseMatrix(manifest, Object.keys(manifest.deployables).join(',')).include.length,
		7,
	)
})
