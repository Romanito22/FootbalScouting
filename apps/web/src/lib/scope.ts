export const SOURCE_LABELS: Record<string, string> = {
  statsbomb: 'StatsBomb', understat: 'Understat', fbref: 'FBref', transfermarkt: 'Transfermarkt',
  pipeline: 'recalcul', manual: 'manuel',
};

/** Périmètre d'un run -> libellé court : « Ligue 1 2015/2016 », « 5 championnats · 2025-2026 ». */
export function describeScope(source: string, scope: string): string {
  const parts = scope.split('|');
  if (source === 'statsbomb') return parts[3] ?? parts.slice(1).join('/');
  if (source === 'understat' || source === 'fbref') {
    const leagues = (parts[1] ?? '').split(',').filter(Boolean);
    const seasons = (parts[2] ?? '').split(',').filter(Boolean)
      .map((code) => (/^\d{4}$/.test(code) ? `20${code.slice(0, 2)}-20${code.slice(2)}` : code));
    const what = leagues.length === 1 ? leagues[0] : `${leagues.length} championnats`;
    return `${what} · ${seasons.join(', ')}`;
  }
  return scope;
}
