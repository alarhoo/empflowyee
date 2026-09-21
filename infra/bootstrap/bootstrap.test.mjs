import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

const mock = `
const fs = require('node:fs')
const a = process.argv.slice(2)
const scenario = process.env.BOOTSTRAP_TEST_SCENARIO
fs.appendFileSync(process.env.BOOTSTRAP_TEST_LOG, JSON.stringify(a) + '\\n')
const is = (...parts) => parts.every((part, index) => a[index] === part)
const output = (value) => { process.stdout.write(value + (scenario === 'existing-crlf' ? '\\r\\n' : '\\n')); process.exit(0) }
const fail = () => { console.error('PERMISSION_DENIED'); process.exit(1) }
if (is('auth', 'list')) output('fixture@example.invalid')
if (is('projects', 'get-ancestors')) {
  if (scenario === 'preflight-error') fail()
  output(scenario === 'wrong-org' ? '999999999999' : '242771450903')
}
if (is('projects', 'list')) output('empflowyee-cicd')
if (is('billing', 'accounts', 'describe')) output('True')
if (is('resource-manager', 'folders', 'list')) {
  if (scenario === 'folder-error') fail()
  if (scenario === 'ambiguous-folder') output('folders/1\\nfolders/2')
  const filter = a.find((v) => v.startsWith('--filter='))
  const names = { empflowyee: '1', shared: '2', nonprod: '3', prod: '4' }
  output('folders/' + names[filter.match(/displayName=(\\w+)/)[1]])
}
if (is('projects', 'describe')) {
  if (a.includes('--format=value(projectNumber)')) output('111111111111')
  if (a.includes('--format=value(parent.id)')) output(a[2] === 'empflowyee-cicd' ? '2' : a[2] === 'empflowyee-prd' ? '4' : '3')
  output('{}')
}
if (is('storage', 'buckets', 'list')) output('empflowyee-tfstate-242771450903')
if (is('storage', 'buckets', 'describe')) {
  const projectNumber = scenario === 'wrong-bucket' ? '222222222222' : '111111111111'
  if (a.includes('--format=value(projectNumber)')) output(projectNumber)
  if (a.includes('--format=value(location)')) output('ASIA-SOUTH1')
  output(JSON.stringify({ projectNumber, location: 'ASIA-SOUTH1' }))
}
if (is('billing', 'projects', 'link') || is('services', 'enable') || is('storage', 'buckets', 'update')) output('')
console.error('Unexpected mock command', a)
process.exit(2)
`

const shells = [
	{
		name: 'Bash',
		command: process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash',
		args: ['bootstrap.sh'],
	},
	{ name: 'PowerShell', command: 'pwsh', args: ['-NoProfile', '-File', 'bootstrap.ps1'] },
]

function simulate(shell, scenario) {
	const directory = mkdtempSync(path.join(tmpdir(), 'empflowyee-bootstrap-test-'))
	try {
		for (const file of ['bootstrap.sh', 'bootstrap.ps1']) {
			copyFileSync(new URL(file, import.meta.url), path.join(directory, file))
		}
		const newline = scenario === 'existing-crlf' ? '\r\n' : '\n'
		writeFileSync(
			path.join(directory, 'foundation.env'),
			['BILLING_ACCOUNT_ID=ABCDEF-123456-ABCDEF', 'BOOTSTRAP_CONFIRM=YES', ''].join(newline),
		)
		writeFileSync(path.join(directory, 'mock.cjs'), mock)
		writeFileSync(
			path.join(directory, 'gcloud'),
			'#!/usr/bin/env bash\nexec node "$BOOTSTRAP_TEST_MOCK" "$@"\n',
		)
		chmodSync(path.join(directory, 'gcloud'), 0o755)
		writeFileSync(
			path.join(directory, 'gcloud.ps1'),
			'& node $env:BOOTSTRAP_TEST_MOCK @args\nexit $LASTEXITCODE\n',
		)
		const log = path.join(directory, 'commands.jsonl')
		writeFileSync(log, '')
		const result = spawnSync(shell.command, shell.args, {
			cwd: directory,
			encoding: 'utf8',
			timeout: 60000,
			env: {
				...process.env,
				PATH: `${directory}${path.delimiter}${process.env.PATH}`,
				BOOTSTRAP_TEST_LOG: log,
				BOOTSTRAP_TEST_MOCK: path.join(directory, 'mock.cjs'),
				BOOTSTRAP_TEST_SCENARIO: scenario,
			},
		})
		assert.ifError(result.error)
		const calls = readFileSync(log, 'utf8')
			.split('\n')
			.filter(Boolean)
			.map((line) => JSON.parse(line))
		return { ...result, calls }
	} finally {
		const resolved = path.resolve(directory)
		assert.equal(path.dirname(resolved), path.resolve(tmpdir()))
		assert.match(path.basename(resolved), /^empflowyee-bootstrap-test-/)
		rmSync(resolved, { recursive: true, force: true })
	}
}

for (const shell of shells) {
	test(`${shell.name}: failed preflight and folder discovery cannot trigger mutations`, () => {
		for (const scenario of ['preflight-error', 'wrong-org', 'folder-error', 'ambiguous-folder']) {
			const result = simulate(shell, scenario)
			assert.notEqual(result.status, 0, `${scenario}: ${result.stdout} ${result.stderr}`)
			assert.ok(result.calls.length > 0)
			assert.equal(
				result.calls.some((args) =>
					args.some((arg) => ['create', 'move', 'link', 'enable', 'update'].includes(arg)),
				),
				false,
			)
		}
	})
	test(`${shell.name}: refuses to change a state bucket owned by another project`, () => {
		const result = simulate(shell, 'wrong-bucket')
		assert.notEqual(result.status, 0)
		assert.ok(result.calls.some((args) => args[0] === 'storage'))
		assert.equal(
			result.calls.some((args) => args[0] === 'storage' && args[2] === 'update'),
			false,
		)
	})
	test(`${shell.name}: an existing foundation is reconciled without creating or moving resources`, () => {
		const result = simulate(shell, 'existing-crlf')
		assert.equal(result.status, 0, `${result.stdout} ${result.stderr}`)
		assert.equal(
			result.calls.some((args) => args.includes('create') || args.includes('move')),
			false,
		)
		assert.ok(
			result.calls.some(
				(args) =>
					args.includes('--uniform-bucket-level-access') &&
					args.includes('--versioning') &&
					args.includes('--public-access-prevention'),
			),
		)
	})
}
