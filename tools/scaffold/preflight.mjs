import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolveNxCli, runNx } from './run-nx.mjs';

const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

// Validate the pnpm build-script policy before Nx is allowed to generate
// projects. pnpm 12 fails closed when a dependency with a lifecycle script is
// neither explicitly allowed nor explicitly denied.
const workspacePolicy = readFileSync(new URL('../../pnpm-workspace.yaml', import.meta.url), 'utf8');
const requiredBuildPolicy = {
  '@nestjs/core': true,
  '@parcel/watcher': false,
  '@swc/core': false,
  '@tailwindcss/oxide': false,
  esbuild: false,
  lmdb: false,
  'msgpackr-extract': false,
  nx: true,
  sharp: false,
  'unrs-resolver': false,
};

function readAllowBuilds(yaml) {
  const lines = yaml.split(/\r?\n/);
  const result = new Map();
  let inAllowBuilds = false;
  let baseIndent = 0;
  for (const line of lines) {
    if (!inAllowBuilds) {
      const match = line.match(/^(\s*)allowBuilds:\s*$/);
      if (match) {
        inAllowBuilds = true;
        baseIndent = match[1].length;
      }
      continue;
    }
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const indent = line.match(/^\s*/)[0].length;
    if (indent <= baseIndent) break;
    const match = line.match(/^\s*['"]?([^'":]+)['"]?\s*:\s*(true|false)\s*$/);
    if (match) result.set(match[1], match[2] === 'true');
  }
  return result;
}

const allowBuilds = readAllowBuilds(workspacePolicy);
const badBuildPolicy = Object.entries(requiredBuildPolicy).filter(
  ([name, expected]) => allowBuilds.get(name) !== expected,
);
if (badBuildPolicy.length) {
  console.error(
    '\nScaffold preflight failed. pnpm build-script policy is incomplete or unexpected:',
  );
  for (const [name, expected] of badBuildPolicy) {
    console.error(`  - ${name}: expected ${expected}, found ${String(allowBuilds.get(name))}`);
  }
  console.error('\nApply the current cumulative scaffold repair before running generators.');
  process.exit(1);
}

const required = ['nx', '@nx/eslint-plugin', 'typescript-eslint', 'typescript'];
const missing = [];

for (const name of required) {
  try {
    require.resolve(`${name}/package.json`);
  } catch {
    missing.push(name);
  }
}

if (missing.length) {
  console.error('\nScaffold preflight failed. Missing installed toolchain packages:');
  for (const name of missing) console.error(`  - ${name}`);
  console.error('\nRun `pnpm install` from the repository root, then retry.');
  process.exit(1);
}

let nxInfo;
try {
  nxInfo = resolveNxCli();
} catch (error) {
  console.error('\nScaffold preflight failed while resolving the Nx CLI.');
  console.error(error.message);
  process.exit(1);
}

const nxVersionResult = runNx(['--version'], { capture: true, allowFailure: true });
if (nxVersionResult.error || nxVersionResult.status !== 0) {
  console.error(
    '\nScaffold preflight failed. The Nx CLI resolved from package metadata could not execute.',
  );
  console.error(`Nx package: ${nxInfo.packageJsonPath}`);
  console.error(`Nx bin entry: ${nxInfo.binEntry}`);
  console.error(`Nx CLI: ${nxInfo.cli}`);
  if (nxVersionResult.error) console.error(nxVersionResult.error);
  if (nxVersionResult.stdout?.trim()) console.error(nxVersionResult.stdout.trim());
  if (nxVersionResult.stderr?.trim()) console.error(nxVersionResult.stderr.trim());
  process.exit(1);
}

const tsVersion = require('typescript/package.json').version;
const tsMajorMinor = tsVersion.split('.').slice(0, 2).join('.');
if (tsMajorMinor !== '6.0') {
  console.error(
    `\nScaffold preflight failed. Angular 22 requires TypeScript 6.0.x; installed: ${tsVersion}`,
  );
  console.error('Run `pnpm install` to restore the repository-pinned toolchain.');
  process.exit(1);
}

const cliVersion =
  nxVersionResult.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? nxInfo.version;
console.log(
  `Preflight OK: Nx ${cliVersion}, TypeScript ${tsVersion}, typescript-eslint ${pkg.devDependencies['typescript-eslint']}`,
);
console.log(`Nx package: ${nxInfo.packageJsonPath}`);
console.log(`Nx declared bin: ${nxInfo.binEntry}`);
console.log(`Nx CLI: ${nxInfo.cli}`);
