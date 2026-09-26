import fs from 'node:fs';
import path from 'node:path';

const files = [
  'docs/hcm/roadmap/HCM-2-SCOPE.md',
  'docs/hcm/roadmap/HCM-2-DECISIONS.md',
  'docs/hcm/architecture/HCM-2-DATA-MODEL-INTEGRATION.md',
  'docs/hcm/domains/workforce-foundation/DOMAIN-MODEL.md',
  'docs/hcm/domains/workforce-foundation/DATA-MODEL.md',
  'docs/hcm/domains/workforce-foundation/BUSINESS-RULES.md',
  'docs/hcm/domains/employee/DOMAIN-MODEL.md',
  'docs/hcm/domains/employee/DATA-MODEL.md',
  'docs/hcm/domains/employee/BUSINESS-RULES.md',
  'docs/hcm/domains/employee/PROFILE-FIELD-POLICY.md',
  'docs/hcm/domains/job-architecture/DOMAIN-MODEL.md',
  'docs/hcm/domains/job-architecture/DATA-MODEL.md',
  'docs/hcm/domains/job-architecture/BUSINESS-RULES.md',
  'claude-prompts/02-HCM2-STEP1-PREPARE.md',
];
let failed = false;
for (const file of files) {
  if (!fs.existsSync(file)) { console.error(`Missing: ${file}`); failed = true; continue; }
  const text = fs.readFileSync(file, 'utf8');
  const forbidden = [/\bv2\b/i, /\bPhase\s+\d+/i, /\bP\d{2}-(?:BR|FR|OD|AC|TC|NFR)-\d+\b/i];
  for (const pattern of forbidden) {
    if (pattern.test(text)) { console.error(`Historical provenance token ${pattern} found in ${file}`); failed = true; }
  }
}
if (failed) process.exit(1);
console.log(`HCM-2 current-domain authority OK (${files.length} files).`);
