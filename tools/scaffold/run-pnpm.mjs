import { spawnSync } from 'node:child_process';
import { extname } from 'node:path';

/**
 * Run pnpm reliably from Node on Windows, macOS, and Linux.
 *
 * pnpm/Corepack can expose npm_execpath in several forms depending on the
 * platform and pnpm/Corepack version:
 *   - a JavaScript CLI (.js/.cjs/.mjs)
 *   - a native executable (pnpm-native.exe)
 *   - a Windows command shim (.cmd/.bat)
 *
 * We must NOT blindly execute npm_execpath with Node. Newer Corepack/pnpm on
 * Windows may set npm_execpath to pnpm-native.exe, and Node will then try to
 * parse the .exe as an ES module, causing ERR_UNKNOWN_FILE_EXTENSION.
 */
export function runPnpm(args, { env = {}, label } = {}) {
  const shown = label ?? `pnpm ${args.join(' ')}`;
  console.log(`\n> ${shown}`);

  const pnpmExecPath = process.env.npm_execpath;
  let command;
  let commandArgs;

  if (pnpmExecPath && /pnpm/i.test(pnpmExecPath)) {
    const extension = extname(pnpmExecPath).toLowerCase();

    if (['.js', '.cjs', '.mjs'].includes(extension)) {
      // Classic package-manager JavaScript entrypoint.
      command = process.execPath;
      commandArgs = [pnpmExecPath, ...args];
    } else if (extension === '.cmd' || extension === '.bat') {
      // Windows command shims require cmd.exe when shell=false.
      command = process.env.ComSpec || 'cmd.exe';
      commandArgs = ['/d', '/s', '/c', pnpmExecPath, ...args];
    } else {
      // pnpm-native.exe (and any other directly executable pnpm launcher).
      command = pnpmExecPath;
      commandArgs = args;
    }
  } else if (process.platform === 'win32') {
    // Direct `node tools/...` execution where npm_execpath is unavailable.
    command = process.env.ComSpec || 'cmd.exe';
    commandArgs = ['/d', '/s', '/c', 'pnpm', ...args];
  } else {
    command = 'pnpm';
    commandArgs = args;
  }

  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
    shell: false,
  });

  if (result.error) {
    console.error(`\nFailed to start: ${shown}`);
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`\nFailed: ${shown} (exit code ${result.status ?? 'unknown'})`);
    process.exit(result.status ?? 1);
  }
}
