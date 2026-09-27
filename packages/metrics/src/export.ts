import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serializeRegistryPayload } from './payload';
import { METRICS } from './registry';

export const EXPORT_PATH = resolve(import.meta.dirname, '../../../pipeline/metrics.json');

writeFileSync(EXPORT_PATH, serializeRegistryPayload());

console.log(`✓ ${METRICS.length} métrique(s) exportée(s) vers ${EXPORT_PATH}`);
