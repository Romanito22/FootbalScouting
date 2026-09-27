import { LEAGUE_STRENGTH } from '@vivier/metrics';
import { IntervalAxis, IntervalBar, type IntervalScale } from '@/components/IntervalBar';
import {
  CI_LABEL, describeStrengthStatus, fetchCompetitionStrengths, formatCoef,
  formatCoefWithInterval, referenceOf,
} from '@/lib/strength';

const TICK_CANDIDATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const BAR_WIDTH = 220;

export default async function CompetitionsPage() {
  const all = await fetchCompetitionStrengths();
  const reference = referenceOf(all);
  const estimated = all
    .filter((c) => c.coef !== null)
    .sort((a, b) => (b.coef ?? 0) - (a.coef ?? 0));
  const others = all.filter((c) => c.coef === null);

  // Axe logarithmique partagé : un rapport de force de 2 a la même longueur
  // dans les deux sens (×2 ou ÷2 autour de la référence).
  const lows = estimated.map((c) => c.low ?? 1);
  const highs = estimated.map((c) => c.high ?? 1);
  const scale: IntervalScale = {
    kind: 'log',
    min: Math.max(0.2, Math.min(1, ...lows) / 1.15),
    max: Math.min(5, Math.max(1, ...highs) * 1.15),
  };
  const ticks = TICK_CANDIDATES.filter((t) => t >= scale.min && t <= scale.max);
  const computedAt = all.find((c) => c.computedAt)?.computedAt;
  const modelVersion = all.find((c) => c.modelVersion)?.modelVersion;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight text-paper">
        Force des championnats
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-paper/70">
        Coefficient = ce que vaut une production dans ce championnat, rapportée à la
        référence{reference ? <> (<span className="text-paper">{reference.name}</span> = 1.00)</> : null}.
        {' '}À 1.25, 0.40 npxG/90 y valent 0.50 dans la référence. Estimé à partir des joueurs
        observés dans deux compétitions à au plus {LEAGUE_STRENGTH.maxSeasonGap} saison
        d'écart (≥ {LEAGUE_STRENGTH.minMinutes} min chacune), intervalle de confiance à{' '}
        {Math.round(LEAGUE_STRENGTH.ciLevel * 100)} % par bootstrap sur les joueurs.
      </p>
      <p className="mt-2 max-w-3xl font-mono text-xs text-paper/50">
        {computedAt
          ? `modèle ${modelVersion ?? '?'} · calculé le ${new Date(computedAt).toLocaleString('fr-FR')}`
          : 'jamais calculé — uv run python -m vivier_pipeline.jobs.compute_strength'}
      </p>

      <table className="mt-8 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-paper/20 text-left text-paper/50">
            <th className="py-1.5 font-normal">Compétition</th>
            <th className="py-1.5 font-normal">Palier</th>
            <th className="py-1.5 text-right font-normal">Coefficient [{CI_LABEL}]</th>
            <th className="py-1.5 pl-6 font-normal">
              <span className="sr-only">Intervalle</span>
            </th>
            <th className="py-1.5 text-right font-normal">Liaisons</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {estimated.map((c) => {
            const label = formatCoefWithInterval(c) ?? '';
            return (
              <tr key={c.id} className="border-b border-paper/10">
                <td className="py-2 font-sans">
                  <span className="text-paper">{c.name}</span>
                  <span className="ml-2 text-xs text-paper/40">{c.country}</span>
                  {c.status === 'reference' && (
                    <span className="ml-2 border border-paper/30 px-1 text-[10px] uppercase tracking-wide text-paper/60">
                      référence
                    </span>
                  )}
                </td>
                <td className="py-2">{c.tier}</td>
                <td className="py-2 text-right">
                  <span className="text-spotlight">{formatCoef(c.coef ?? 1)}</span>
                  {c.status !== 'reference' && (
                    <span className="ml-1 text-paper/50">
                      [{formatCoef(c.low ?? 1)} – {formatCoef(c.high ?? 1)}]
                    </span>
                  )}
                </td>
                <td className="py-2 pl-6">
                  <IntervalBar
                    value={c.coef ?? 1}
                    low={c.low ?? 1}
                    high={c.high ?? 1}
                    scale={scale}
                    reference={1}
                    width={BAR_WIDTH}
                    title={`${c.name} : ${label} (${CI_LABEL})`}
                  />
                </td>
                <td className="py-2 text-right text-paper/70">{c.links ?? 0}</td>
              </tr>
            );
          })}
          {estimated.length > 0 && (
            <tr>
              <td colSpan={3} />
              <td className="pl-6 pt-1">
                <IntervalAxis scale={scale} ticks={ticks} width={BAR_WIDTH} format={(t) => String(t)} />
              </td>
              <td />
            </tr>
          )}
        </tbody>
      </table>

      {estimated.length === 0 && (
        <p className="mt-6 text-sm text-paper/60">
          Aucun coefficient estimé pour l'instant : il faut des joueurs observés dans plusieurs
          compétitions (au moins {LEAGUE_STRENGTH.minLinkPlayers} par compétition).
        </p>
      )}

      {others.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-2 font-display text-lg font-bold text-paper">Non estimés</h2>
          <p className="mb-3 max-w-3xl text-sm text-paper/60">
            Pas de coefficient, donc pas de percentile « toutes compétitions » pour leurs joueurs :
            ils restent comparés à leur seul palier. Jamais de 1.00 implicite.
          </p>
          <table className="w-full border-collapse text-sm">
            <tbody className="font-mono">
              {others.map((c) => (
                <tr key={c.id} className="border-b border-paper/10">
                  <td className="py-1.5 font-sans text-paper">
                    {c.name}
                    <span className="ml-2 text-xs text-paper/40">{c.country}</span>
                  </td>
                  <td className="whitespace-nowrap py-1.5 text-paper/60">palier {c.tier}</td>
                  <td className="py-1.5 text-right text-xs text-paper/60">{describeStrengthStatus(c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="mt-10 max-w-3xl border-t border-paper/15 pt-4 text-xs text-paper/50">
        <h2 className="mb-1 font-sans text-sm text-paper/70">Limites connues du modèle</h2>
        <ul className="list-disc space-y-1 pl-4">
          <li>Indice purement offensif (npxG, xA, tirs, passes clés, dribbles réussis…) : ne dit rien de l'exigence défensive d'un championnat.</li>
          <li>Biais de sélection : un joueur qui monte d'un cran sort souvent d'une saison exceptionnelle, la régression vers la moyenne gonfle un peu l'écart estimé.</li>
          <li>Évolution du joueur entre deux saisons ignorée (écart limité à {LEAGUE_STRENGTH.maxSeasonGap} saison).</li>
          <li>Référence choisie automatiquement (la compétition la plus reliée aux autres), modifiable avec <code>compute_strength --reference-competition-id</code>.</li>
        </ul>
      </section>
    </main>
  );
}
