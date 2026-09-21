import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, normalize, resolve } from 'node:path';

const require = createRequire(import.meta.url);

/**
 * Resolve the workspace-local Nx CLI from Nx's own package.json `bin` field.
 *
 * Do not hard-code a path such as `bin/nx.js`: Nx 23.2.1 publishes the CLI at
 * `dist/bin/nx.js`. Reading the package metadata also makes this resilient to
 * future Nx package-layout changes and to pnpm's virtual-store layout.
 */
export function resolveNxCli() {
  let nxPackageJsonPath;
  try {
    nxPackageJsonPath = require.resolve('nx/package.json');
  } catch (error) {
    throw new Error(
      'Cannot resolve the workspace-local Nx package. Run `pnpm install` from the repository root first.',
      { cause: error },
    );
  }

  const nxPackage = JSON.parse(readFileSync(nxPackageJsonPath, 'utf8'));
  const binEntry = typeof nxPackage.bin === 'string' ? nxPackage.bin : nxPackage.bin?.nx;

  if (!binEntry || typeof binEntry !== 'string') {
    throw new Error(
      `Nx package at ${nxPackageJsonPath} does not declare a usable \`bin.nx\` entry.`,
    );
  }

  const cli = resolve(dirname(nxPackageJsonPath), binEntry);
  if (!existsSync(cli)) {
    throw new Error(
      `Nx package declares its CLI as ${binEntry}, but the resolved file does not exist: ${cli}`,
    );
  }

  return {
    cli,
    packageJsonPath: nxPackageJsonPath,
    version: nxPackage.version ?? 'unknown',
    binEntry,
  };
}

/**
 * Run the workspace-local Nx CLI directly with the current Node runtime.
 * This avoids Corepack/.cmd/.exe launcher differences on Windows while still
 * using Nx's own declared executable path.
 */
export function runNx(args, { capture = false, allowFailure = false, env = {} } = {}) {
  const { cli } = resolveNxCli();

  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: process.cwd(),
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: capture ? 'utf8' : undefined,
    env: {
      ...process.env,
      NX_INTERACTIVE: 'false',
      NX_DAEMON: 'false',
      ...env,
    },
    shell: false,
  });

  if (result.error) throw result.error;

  if (result.status !== 0 && !allowFailure) {
    const stdout = capture && result.stdout?.trim() ? `\nstdout:\n${result.stdout.trim()}` : '';
    const stderr = capture && result.stderr?.trim() ? `\nstderr:\n${result.stderr.trim()}` : '';
    throw new Error(
      `Nx command failed (${result.status ?? 'unknown'}): nx ${args.join(' ')}${stdout}${stderr}`,
    );
  }

  return result;
}

export function getNxProject(projectName) {
  const result = runNx(['show', 'project', projectName, '--json'], {
    capture: true,
    allowFailure: true,
  });

  if (result.status !== 0) return null;

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(
      `Nx reported project ${projectName}, but its JSON configuration could not be parsed: ${error.message}`,
    );
  }
}

export function nxProjectExistsAt(projectName, expectedRoot) {
  const project = getNxProject(projectName);
  if (!project) return false;

  const actualRoot = normalize(project.root ?? '');
  const wantedRoot = normalize(expectedRoot);

  if (actualRoot !== wantedRoot) {
    throw new Error(
      `Nx project name collision: ${projectName} already exists at ${actualRoot}, expected ${wantedRoot}. ` +
        'Do not continue until the collision is resolved.',
    );
  }

  return true;
}
