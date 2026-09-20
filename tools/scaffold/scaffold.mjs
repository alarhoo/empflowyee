import { runPnpm } from './run-pnpm.mjs';

console.log('empFLOWyee scaffold starting...');
console.log(`Node: ${process.version}`);
console.log(`Platform: ${process.platform} ${process.arch}`);

runPnpm(['scaffold:projects']);
runPnpm(['scaffold:ui']);
runPnpm(['architecture:check']);
runPnpm(['docs:check']);
runPnpm(['exec', 'nx', 'format:write']);

console.log('\nempFLOWyee foundation scaffold complete.');
console.log('Next: inspect `pnpm graph`, commit the baseline, then build the HCM shell/UX foundation.');
