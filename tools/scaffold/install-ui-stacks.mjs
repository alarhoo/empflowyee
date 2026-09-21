import { readFileSync } from 'node:fs';
import { runPnpm } from './run-pnpm.mjs';

function run(args) {
  runPnpm(args);
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const angularRange = pkg.dependencies?.['@angular/core'] ?? pkg.devDependencies?.['@angular/core'];
const angularVersion = angularRange?.match(/\d+\.\d+\.\d+/)?.[0];
if (!angularVersion) {
  console.error('Angular was not found in package.json. Run the project scaffold first.');
  process.exit(1);
}

console.log(`Detected Angular ${angularVersion}`);

// Keep Angular CDK/animations on the exact same patch as the generated Angular framework.
run(['add', '-w', `@angular/cdk@${angularVersion}`, `@angular/animations@${angularVersion}`]);

// HCM: maintained Angular wrappers + SAP design system.
// Pin the approved stable Fundamental NGX line rather than installing prereleases.
run([
  'add',
  '-w',
  '@fundamental-ngx/cdk@0.64.3',
  '@fundamental-ngx/core@0.64.3',
  '@fundamental-ngx/platform@0.64.3',
  '@fundamental-ngx/i18n@0.64.3',
  '@fundamental-ngx/ui5-webcomponents@0.64.3',
  '@fundamental-ngx/ui5-webcomponents-fiori@0.64.3',
  '@ui5/webcomponents@2.26.0',
  '@ui5/webcomponents-base@2.26.0',
  '@ui5/webcomponents-fiori@2.26.0',
  '@sap-theming/theming-base-content@11.36.5',
  'fundamental-styles@0.41.4',
]);

// Important: @fundamental-ngx/nx-plugin is present in the Fundamental NGX
// source workspace/docs but is not currently published on the public npm
// registry. Do not make the application scaffold depend on an unpublished
// package. We use standard Nx generators and will add our own repo-local
// generators under tools/generators when needed.
//
// @fundamental-ngx/mcp *is* published, but it is an external AI tool rather
// than an application dependency. We intentionally do not install it into the
// workspace. The AI integration pass will configure it via npx/pnpm dlx so it
// can be upgraded independently of the product dependency graph.

// Account: install the Spartan Nx/Angular CLI. Helm code is copied only when a component is actually selected.
run(['add', '-Dw', '@spartan-ng/cli@1.4.1']);

// Console: PrimeNG + token-based theming.
run(['add', '-w', 'primeng@22.1.1', '@primeuix/themes@3.0.1']);

console.log('\nUI stack dependencies installed.');
console.log(
  'Fundamental NGX MCP is intentionally configured later as AI tooling, not a workspace dependency.',
);
console.log(
  'Spartan init/component generation is intentionally deferred until the Account UX foundation pass.',
);
