import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const expected = [
  ['apps/marketing/web/project.json', 'marketing-web', ['product:marketing', 'runtime:web', 'type:app']],
  ['apps/account/web/project.json', 'account-web', ['product:account', 'runtime:web', 'type:app']],
  ['apps/account/api/project.json', 'account-api', ['product:account', 'runtime:api', 'type:app']],
  ['apps/hcm/web/project.json', 'hcm-web', ['product:hcm', 'runtime:web', 'type:app']],
  ['apps/hcm/api/project.json', 'hcm-api', ['product:hcm', 'runtime:api', 'type:app']],
  ['apps/console/web/project.json', 'console-web', ['product:console', 'runtime:web', 'type:app']],
  ['apps/console/api/project.json', 'console-api', ['product:console', 'runtime:api', 'type:app']],
];

let failed = false;
for (const [path, name, requiredTags] of expected) {
  if (!existsSync(path)) {
    console.error(`Missing Nx project: ${path}. Run pnpm scaffold:projects first.`);
    failed = true;
    continue;
  }
  const project = JSON.parse(readFileSync(path, 'utf8'));
  if (project.name !== name) {
    console.error(`${path}: expected name ${name}, found ${project.name}`);
    failed = true;
  }
  const tags = new Set(project.tags ?? []);
  for (const tag of requiredTags) {
    if (!tags.has(tag)) {
      console.error(`${path}: missing required tag ${tag}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('Architecture verification passed.');
