import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MIN_MINUTES, PEER_GROUP_SEASON_SPAN, POSITION_GROUP_LABELS, POSITION_GROUPS,
} from './constants';
import { METRICS } from './registry';

const outPath = resolve(import.meta.dirname, '../../../pipeline/metrics.json');

const payload = {
  minMinutes: MIN_MINUTES,
  peerGroupSeasonSpan: PEER_GROUP_SEASON_SPAN,
  positionGroups: POSITION_GROUPS,
  positionGroupLabels: POSITION_GROUP_LABELS,
  metrics: METRICS,
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`✓ ${METRICS.length} métrique(s) exportée(s) vers ${outPath}`);
