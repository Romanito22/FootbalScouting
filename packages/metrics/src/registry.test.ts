import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OUTFIELD_POSITION_GROUPS, POSITION_GROUPS } from './constants';
import { serializeRegistryPayload } from './payload';
import { METRICS, RADAR_METRICS, getMetric, metricsForPosition } from './registry';

/**
 * Le registre est la source de vérité unique des métriques (CLAUDE.md).
 * Une incohérence ici se propage en silence à tous les percentiles : ces
 * tests la font échouer tout de suite.
 */
describe('registre des métriques', () => {
  it('a des clés uniques', () => {
    const keys = METRICS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("n'applique jamais une métrique à la fois aux gardiens et aux joueurs de champ", () => {
    for (const m of METRICS) {
      const gk = m.appliesTo.includes('GK');
      const outfield = m.appliesTo.some((p) => p !== 'GK');
      expect(gk && outfield, m.key).toBe(false);
      expect(m.appliesTo.length, m.key).toBeGreaterThan(0);
    }
  });

  it('réserve la famille gk aux métriques de gardien, préfixées gk_', () => {
    for (const m of METRICS) {
      const isGk = m.appliesTo.includes('GK');
      expect(m.family === 'gk', m.key).toBe(isGk);
      expect(m.key.startsWith('gk_'), m.key).toBe(isGk);
    }
  });

  it("n'ajuste de la force du championnat que des volumes per-90 « plus = mieux »", () => {
    for (const m of METRICS.filter((d) => d.leagueAdjusted)) {
      expect(m.per90, m.key).toBe(true);
      expect(m.higherIsBetter, m.key).toBe(true);
      expect(m.appliesTo.includes('GK'), m.key).toBe(false);
    }
  });

  it('déclare explicitement la source des métriques hors StatsBomb', () => {
    for (const m of METRICS.filter((d) => d.sources)) {
      expect(m.sources?.length, m.key).toBeGreaterThan(0);
    }
    expect(getMetric('xg_chain')?.sources).toEqual(['understat']);
  });

  it('formate les taux en pourcentage et jamais en per-90', () => {
    for (const m of METRICS.filter((d) => d.format === 'pct')) {
      expect(m.per90, m.key).toBe(false);
    }
  });

  it('définit un radar pour chaque poste, avec des métriques qui s’y appliquent', () => {
    for (const position of POSITION_GROUPS) {
      const keys = RADAR_METRICS[position];
      expect(keys.length, position).toBeGreaterThanOrEqual(6);
      expect(new Set(keys).size, position).toBe(keys.length);
      for (const key of keys) {
        const def = getMetric(key);
        expect(def, `${position}:${key}`).toBeDefined();
        expect(def?.appliesTo.includes(position), `${position}:${key}`).toBe(true);
      }
    }
  });

  it('couvre chaque poste de champ avec le même jeu de métriques', () => {
    const reference = metricsForPosition('CM').map((m) => m.key);
    for (const position of OUTFIELD_POSITION_GROUPS) {
      expect(metricsForPosition(position).map((m) => m.key)).toEqual(reference);
    }
  });

  it('est exporté à jour pour le pipeline (pnpm metrics:export)', () => {
    const exported = readFileSync(
      resolve(import.meta.dirname, '../../../pipeline/metrics.json'), 'utf8',
    );
    expect(exported).toBe(serializeRegistryPayload());
  });
});
