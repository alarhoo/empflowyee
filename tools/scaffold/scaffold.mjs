import { spawnSync } from 'node:child_process';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function run(args) {
  const result = spawnSync(pnpm, args, { stdio: 'inherit', env: { ...process.env, NX_INTERACTIVE: 'false' } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['scaffold:projects']);
run(['scaffold:ui']);
run(['architecture:check']);
run(['docs:check']);
run(['exec', 'nx', 'format:write']);

console.log('\nempFLOWyee foundation scaffold complete.');
console.log('Next: inspect `pnpm graph`, commit the baseline, then build the HCM shell/UX foundation.');
