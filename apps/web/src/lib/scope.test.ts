import { describe, expect, it } from 'vitest';
import { describeScope } from './scope';

describe('libellé des runs', () => {
  it('StatsBomb : le nom de la compétition', () => {
    expect(describeScope('statsbomb', 'statsbomb|7|27|Ligue 1 2015/2016')).toBe('Ligue 1 2015/2016');
  });
  it('StatsBomb ancien format : les identifiants', () => {
    expect(describeScope('statsbomb', 'statsbomb|7|27')).toBe('7/27');
  });
  it('Understat : nombre de championnats et saison lisible', () => {
    expect(describeScope('understat', 'understat|ENG-Premier League,FRA-Ligue 1|2627'))
      .toBe('2 championnats · 2026-2027');
    expect(describeScope('understat', 'understat|FRA-Ligue 1|2526')).toBe('FRA-Ligue 1 · 2025-2026');
  });
  it('recalculs : le périmètre tel quel', () => {
    expect(describeScope('pipeline', 'percentiles')).toBe('percentiles');
  });
});
