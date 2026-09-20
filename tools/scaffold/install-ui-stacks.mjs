import { readFileSync } from 'node:fs';
import { runPnpm } from './run-pnpm.mjs';

function run(args) {
  runPnpm(args);
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const angularRange = pkg.dependencies?.['@angular/core'] ?? pkg.devDependencies?.['@angular/core'];
const angularVersion = angularRange?.match(/\d+\.\d+\.\d+/)?.[0];
if (!angularVersion) {
  console.error('Angular was not found in package.json. Run `pnpm scaffold:projects` first.');
  process.exit(1);
}

// Keep Angular CDK/animations on the exact same patch as the generated Angular framework.
run(['add', '-w', `@angular/cdk@${angularVersion}`, `@angular/animations@${angularVersion}`]);

// HCM: maintained Angular wrappers + SAP design system. Keep Fundamental on the approved 0.64 line.
run([
  'add', '-w',
  '@fundamental-ngx/cdk@^0.64.0',
  '@fundamental-ngx/core@^0.64.0',
  '@fundamental-ngx/platform@^0.64.0',
  '@fundamental-ngx/i18n@^0.64.0',
  '@fundamental-ngx/ui5-webcomponents@^0.64.0',
  '@fundamental-ngx/ui5-webcomponents-fiori@^0.64.0',
  '@ui5/webcomponents@^2.26.0',
  '@ui5/webcomponents-base@^2.26.0',
  '@ui5/webcomponents-fiori@^2.26.0',
  '@sap-theming/theming-base-content@^11.0.0',
  'fundamental-styles@^0.41.0',
]);

run([
  'add', '-Dw',
  '@fundamental-ngx/mcp@^0.64.0',
  '@fundamental-ngx/nx-plugin@^0.64.0',
]);

// Account: install the Spartan Nx/Angular CLI. Helm code is copied only when a component is actually selected.
run(['add', '-Dw', '@spartan-ng/cli@^1.4.1']);

// Console: PrimeNG + token-based theming.
run(['add', '-w', 'primeng@^22.1.1', '@primeuix/themes@^3.0.0']);

console.log('\nUI stack dependencies installed.');
console.log('Spartan init/component generation is intentionally deferred until the Account UX foundation pass.');
