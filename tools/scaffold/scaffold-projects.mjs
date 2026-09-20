import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function runNx(args) {
  console.log(`\n> nx ${args.join(' ')}`);
  const result = spawnSync(pnpm, ['exec', 'nx', ...args], {
    stdio: 'inherit',
    env: { ...process.env, NX_INTERACTIVE: 'false' },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function generateIfMissing(projectJson, args) {
  if (existsSync(projectJson)) {
    console.log(`Skipping existing project: ${projectJson}`);
    return;
  }
  runNx(args);
}

const angularApps = [
  ['account', 4300, 'ef-account'],
  ['hcm', 4302, 'ef-hcm'],
  ['console', 4301, 'ef-console'],
];

// Marketing: one Next.js deployment.
generateIfMissing(
  join('apps', 'marketing', 'web', 'project.json'),
  [
    'g', '@nx/next:application', 'apps/marketing/web',
    '--name=marketing-web',
    '--appDir=true',
    '--style=css',
    '--e2eTestRunner=playwright',
    '--tags=product:marketing,runtime:web,domain:marketing,type:app',
  ],
);

// Angular frontends. Zone.js is intentionally retained for third-party UI compatibility.
for (const [product, port, prefix] of angularApps) {
  generateIfMissing(
    join('apps', product, 'web', 'project.json'),
    [
      'g', '@nx/angular:application', `apps/${product}/web`,
      `--name=${product}-web`,
      '--routing=true',
      '--standalone=true',
      '--strict=true',
      '--style=scss',
      '--bundler=esbuild',
      '--unitTestRunner=vitest-angular',
      '--e2eTestRunner=playwright',
      '--zoneless=false',
      `--port=${port}`,
      `--prefix=${prefix}`,
      `--tags=product:${product},runtime:web,domain:shell,type:app`,
    ],
  );
}

// NestJS APIs.
for (const product of ['account', 'hcm', 'console']) {
  generateIfMissing(
    join('apps', product, 'api', 'project.json'),
    [
      'g', '@nx/nest:application', `apps/${product}/api`,
      `--name=${product}-api`,
      `--tags=product:${product},runtime:api,domain:bootstrap,type:app`,
    ],
  );
}

// Patch API fallback ports after generation. Cloud Run will still provide PORT in deployment.
const apiPorts = { account: 4400, console: 4401, hcm: 4402 };
for (const [product, port] of Object.entries(apiPorts)) {
  const file = join('apps', product, 'api', 'src', 'main.ts');
  if (!existsSync(file)) continue;
  let source = readFileSync(file, 'utf8');
  source = source.replace(/process\.env\.PORT\s*\|\|\s*3000/g, `process.env.PORT || ${port}`);
  source = source.replace(/process\.env\['PORT'\]\s*\|\|\s*3000/g, `process.env['PORT'] || ${port}`);
  source = source.replace(/await app\.listen\(3000\)/g, `await app.listen(process.env.PORT || ${port})`);
  writeFileSync(file, source);
}

console.log('\nNx projects generated. Run `pnpm install` if your Nx version did not automatically install generated dependencies.');
