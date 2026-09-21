import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

/** Resolve the installed Nx executable through package metadata rather than a version-specific path. */
export function resolveNxCli(workspaceRoot = process.cwd()) {
	const requireFromWorkspace = createRequire(path.join(workspaceRoot, 'package.json'))
	const packageJsonPath = requireFromWorkspace.resolve('nx/package.json')
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
	const bin = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.nx

	if (!bin) {
		throw new Error(`Nx package at ${packageJsonPath} does not declare bin.nx`)
	}

	const cli = path.resolve(path.dirname(packageJsonPath), bin)
	if (!fs.existsSync(cli)) {
		throw new Error(`Nx CLI declared by package metadata does not exist: ${cli}`)
	}

	return cli
}

/** Run Nx with the current managed Node runtime and return captured output, rejecting unexpected failures. */
export function runNx(args, { workspaceRoot = process.cwd(), allowFailure = false } = {}) {
	const cli = resolveNxCli(workspaceRoot)
	const result = spawnSync(process.execPath, [cli, ...args], {
		cwd: workspaceRoot,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
		env: { ...process.env, NX_DAEMON: 'false' },
		stdio: ['ignore', 'pipe', 'pipe'],
	})

	if (result.error) throw result.error
	if (result.status !== 0 && !allowFailure) {
		throw new Error(
			`Nx command failed (${result.status}): nx ${args.join(' ')}\n${result.stderr || result.stdout}`,
		)
	}

	return result
}
