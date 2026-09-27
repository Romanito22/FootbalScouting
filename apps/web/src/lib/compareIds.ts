/** Trois finalistes au plus : au-delà, un radar superposé devient illisible
 * et la palette ne garantit plus la distinction des séries (validée à 3). */
export const MAX_COMPARED = 3;

/** `ids=1,2,3` ou `ids=1&ids=2` (cases à cocher) ; doublons et valeurs
 * invalides ignorés, ordre conservé (il fixe les couleurs), 3 au plus. */
export function parseIds(raw: string | string[] | undefined): number[] {
  const parts = (Array.isArray(raw) ? raw : [raw ?? ''])
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => /^\d+$/.test(v))
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => n > 0);
  return [...new Set(parts)].slice(0, MAX_COMPARED);
}
