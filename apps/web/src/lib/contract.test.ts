import { describe, expect, it } from 'vitest';
import { ageOn, contractAlert, formatMarketValue } from './contract';

const TODAY = new Date('2026-09-27T12:00:00Z');

describe('alertes contrat', () => {
  it('signale un contrat terminé comme libre', () => {
    expect(contractAlert('2026-06-30', TODAY)).toBe('expired');
  });
  it('alerte forte sous 6 mois', () => {
    expect(contractAlert('2027-01-31', TODAY)).toBe('urgent');
  });
  it('alerte sous 12 mois', () => {
    expect(contractAlert('2027-06-30', TODAY)).toBe('soon');
  });
  it('rien au-delà de 12 mois', () => {
    expect(contractAlert('2028-06-30', TODAY)).toBe('none');
  });
  it('distingue « inconnu » de « pas d’alerte »', () => {
    expect(contractAlert(null, TODAY)).toBe('unknown');
  });
});

describe('âge', () => {
  it("n'ajoute l'année qu'une fois l'anniversaire passé", () => {
    expect(ageOn('2000-09-28', TODAY)).toBe(25);
    expect(ageOn('2000-09-27', TODAY)).toBe(26);
  });
  it('reste inconnu sans date de naissance', () => {
    expect(ageOn(null, TODAY)).toBeNull();
  });
});

describe('valeur marchande', () => {
  it('formate en M€ / k€', () => {
    expect(formatMarketValue(6_500_000)).toBe('6.5 M€');
    expect(formatMarketValue(750_000)).toBe('750 k€');
    expect(formatMarketValue(null)).toBe('—');
  });
});
