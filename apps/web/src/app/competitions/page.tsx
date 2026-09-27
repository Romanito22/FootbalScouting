import { LEAGUE_STRENGTH } from '@vivier/metrics';
import { IntervalAxis, IntervalBar, type IntervalScale } from '@/components/IntervalBar';
import { Card, Chip, PageHeader } from '@/components/ui';
import {
  CI_LABEL, describeStrengthStatus, fetchCompetitionStrengths, formatCoef,
  formatCoefWithInterval, referenceOf,
} from '@/lib/strength';

const TICK_CANDIDATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const BAR_WIDTH = 300;

export const metadata = { title: 'Championnats' };

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
    <main className="mx-auto max-w-6xl px-6 py-8 lg:px-10">
      <PageHeader
        eyebrow="Explorer"
        title="Force des championnats"
        description={<>
          Coefficient = ce que vaut une production dans ce championnat, rapportée à la référence
          {reference ? <> (<span className="text-paper">{reference.name}</span> = 1.00)</> : null}. À 1.25,
          0.40 npxG/90 y valent 0.50 dans la référence. Estimé sur les joueurs observés dans deux
          compétitions à au plus {LEAGUE_STRENGTH.maxSeasonGap} saison d'écart (≥ {LEAGUE_STRENGTH.minMinutes} min
          chacune) ; intervalle de confiance à {Math.round(LEAGUE_STRENGTH.ciLevel * 100)} % par bootstrap sur les joueurs.
        </>}
        actions={<Chip tone="muted">{computedAt ? `modèle ${modelVersion ?? '?'} · ${new Date(computedAt).toLocaleString('fr-FR')}` : 'jamais calculé'}</Chip>}
      />

      <Card title="Coefficients estimés" subtitle={`point = estimation · trait = ${CI_LABEL} · pointillés = référence (1.00) · échelle logarithmique`} padded={false}>
        {estimated.length === 0 ? (
          <p className="p-5 text-sm text-paper/60">
            Aucun coefficient estimé : il faut des joueurs observés dans plusieurs compétitions (au moins {LEAGUE_STRENGTH.minLinkPlayers} par compétition).
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-paper/50">
                <th className="px-5 py-2 font-medium">Compétition</th>
                <th className="px-3 py-2 font-medium">Palier</th>
                <th className="px-3 py-2 text-right font-medium">Coefficient [{CI_LABEL}]</th>
                <th className="px-3 py-2 font-medium"><span className="sr-only">Intervalle</span></th>
                <th className="px-5 py-2 text-right font-medium">Liaisons</th>
              </tr>
            </thead>
            <tbody className="num">
              {estimated.map((c) => {
                const text = formatCoefWithInterval(c) ?? '';
                return (
                  <tr key={c.id} className="border-b border-line/60">
                    <td className="px-5 py-2.5">
                      <span className="text-paper">{c.name}</span>
                      <span className="ml-2 text-xs text-paper/40">{c.country}</span>
                      {c.status === 'reference' && <span className="ml-2"><Chip>référence</Chip></span>}
                    </td>
                    <td className="px-3 py-2.5 text-paper/60">{c.tier}</td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      <span className="font-semibold text-paper">{formatCoef(c.coef ?? 1)}</span>
                      {c.status !== 'reference' && <span className="ml-1 text-paper/45">[{formatCoef(c.low ?? 1)} – {formatCoef(c.high ?? 1)}]</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <IntervalBar value={c.coef ?? 1} low={c.low ?? 1} high={c.high ?? 1} scale={scale} reference={1} width={BAR_WIDTH} title={`${c.name} : ${text} (${CI_LABEL})`} />
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono text-paper/60">{c.links ?? 0}</td>
                  </tr>
                );
              })}
              <tr>
                <td colSpan={3} />
                <td className="px-3 pb-3 pt-1"><IntervalAxis scale={scale} ticks={ticks} width={BAR_WIDTH} format={(t) => String(t)} /></td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </Card>

      {others.length > 0 && (
        <Card title="Non estimés" subtitle="pas de coefficient, donc pas de percentile « toutes compétitions » : comparés à leur seul palier — jamais de 1.00 implicite" className="mt-6" padded={false}>
          <ul className="divide-y divide-line">
            {others.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                <span>
                  <span className="text-paper">{c.name}</span>
                  <span className="ml-2 text-xs text-paper/40">{c.country} · palier {c.tier}</span>
                </span>
                <span className="text-xs text-paper/55">{describeStrengthStatus(c)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Limites connues du modèle" className="mt-6">
        <ul className="list-disc space-y-1.5 pl-4 text-sm text-paper/60">
          <li>Indice purement offensif (npxG, xA, tirs, passes clés, progression…) : ne dit rien de l'exigence défensive d'un championnat.</li>
          <li>Biais de sélection : un joueur qui monte d'un cran sort souvent d'une saison exceptionnelle ; la régression vers la moyenne gonfle un peu l'écart estimé.</li>
          <li>Évolution du joueur entre deux saisons ignorée (écart limité à {LEAGUE_STRENGTH.maxSeasonGap} saison).</li>
          <li>Référence choisie automatiquement (la compétition la plus reliée), modifiable : <code className="text-paper/80">compute_strength --reference-competition-id</code>.</li>
        </ul>
      </Card>
    </main>
  );
}
