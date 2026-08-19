import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { METRICS } from './registry';

const outPath = resolve(import.meta.dirname, '../../../pipeline/metrics.json');

writeFileSync(outPath, `${JSON.stringify(METRICS, null, 2)}\n`);

console.log(`✓ ${METRICS.length} métrique(s) exportée(s) vers ${outPath}`);
