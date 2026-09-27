import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, players, playerVectors } from '@vivier/db';
import { MIN_MINUTES, POSITION_GROUP_LABELS } from '@vivier/metrics';
import { ContractBadge } from '@/components/ContractBadge';
import { ageOn, formatMarketValue } from '@/lib/contract';
import { latestVector, type SimilarConstraints, type SimilarRow, topSimilar } from '@/lib/similarity';

const RESULT_LIMIT = 10;

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toInt(value: string | undefined): number | null {
  const n = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

export default async function SimilarPlayersPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const playerId = Number(id);
  if (!Number.isInteger(playerId)) notFound();

  const [player] = await db.select().from(players).where(eq(players.id, playerId));
  if (!player) notFound();

  // Par défaut : même poste. Décocher pour chercher un profil proche à un
  // autre poste (un 8 qui joue comme un 10, un latéral reconvertible…).
  const submitted = first(query.submitted) === '1';
  const samePosition = submitted ? first(query.samePosition) === '1' : true;
  const constraints: SimilarConstraints = {
    targetIsGoalkeeper: player.positionGroup === 'GK',
    samePositionAs: samePosition ? player.positionGroup : null,
    ageMax: toInt(first(query.ageMax)),
    marketValueMax: toInt(first(query.marketValueMax)),
    contractBefore: first(query.contractBefore) || null,
  };
  const hasConstraints = constraints.ageMax !== null || constraints.marketValueMax !== null
    || constraints.contractBefore !== null;

  const target = await latestVector(playerId);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6">
        <p className="font-mono text-xs text-paper/50">
          <Link href={`/players/${playerId}`} className="hover:text-spotlight">← {player.fullName}</Link>
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-paper">
          Joueurs similaires
        </h1>
        <p className="mt-1 text-sm text-paper/60">
          Qui pour le remplacer ? Même profil de jeu (style), même niveau (ajusté du championnat),
          sous tes contraintes de recrutement.
        </p>
      </div>

      <form method="get" className="mb-8 flex flex-wrap items-end gap-4 border-b border-paper/15 pb-6">
        <input type="hidden" name="submitted" value="1" />
        <label className="flex items-center gap-2 text-sm text-paper">
          <input type="checkbox" name="samePosition" value="1" defaultChecked={samePosition} />
          Même poste ({POSITION_GROUP_LABELS[player.positionGroup]})
        </label>
        <label className="text-xs text-paper/50">
          Âge max
          <input type="number" name="ageMax" defaultValue={constraints.ageMax ?? ''} className="mt-1 block w-24 border border-paper/30 bg-ink px-2 py-1 text-sm text-paper" />
        </label>
        <label className="text-xs text-paper/50">
          Valeur max (€)
          <input type="number" name="marketValueMax" defaultValue={constraints.marketValueMax ?? ''} className="mt-1 block w-36 border border-paper/30 bg-ink px-2 py-1 text-sm text-paper" />
        </label>
        <label className="text-xs text-paper/50">
          Fin de contrat avant
          <input type="date" name="contractBefore" defaultValue={constraints.contractBefore ?? ''} className="mt-1 block border border-paper/30 bg-ink px-2 py-1 text-sm text-paper" />
        </label>
        <button type="submit" className="border border-spotlight px-4 py-1.5 text-sm text-spotlight hover:bg-spotlight/10">
          Appliquer
        </button>
      </form>

      {!target || !target.styleVec || !target.qualityVec ? (
        <p className="text-paper/60">
          Pas de vecteur calculé pour ce joueur — moins de {MIN_MINUTES} minutes jouées, ou le
          job compute_vectors n'a pas encore tourné.
        </p>
      ) : (
        <>
          <p className="mb-2 font-mono text-xs text-paper/50">
            Référence : saison {target.season} (la plus récente avec vecteur) · modèle {target.modelVersion}
          </p>
          {hasConstraints && (
            <p className="mb-2 font-mono text-xs text-paper/50">
              Contraintes : âge, valeur et contrat ne filtrent que les joueurs pour qui la donnée est
              connue (import Transfermarkt).
            </p>
          )}
          <p className="mb-8 max-w-3xl text-xs text-paper/50">
            Similarité cosinus : 100 % = même proportion de jeu (style) ou même profil de percentiles
            (niveau). Ce n'est pas une estimation statistique mais une distance ; elle n'est fiable que
            si les groupes de pairs sont bien fournis.
          </p>

          <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
            <SimilarList
              title="Similaires en style"
              subtitle="joue comme lui"
              rows={await topSimilar(playerVectors.styleVec, target.styleVec, playerId, RESULT_LIMIT, constraints)}
              compareWith={playerId}
            />
            <SimilarList
              title="Similaires en niveau"
              subtitle="aussi bon que lui, ajusté du championnat"
              rows={await topSimilar(playerVectors.qualityVec, target.qualityVec, playerId, RESULT_LIMIT, constraints)}
              compareWith={playerId}
            />
          </div>
        </>
      )}
    </main>
  );
}

function SimilarList({
  title, subtitle, rows, compareWith,
}: {
  title: string;
  subtitle: string;
  rows: SimilarRow[];
  compareWith: number;
}) {
  return (
    <section>
      <h2 className="font-display text-lg font-bold text-paper">{title}</h2>
      <p className="mb-3 font-mono text-xs text-paper/50">{subtitle}</p>
      <ol className="space-y-2">
        {rows.map((row, i) => (
          <li key={row.playerId} className="border-b border-paper/10 pb-2 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-paper/40">{i + 1}.</span>
              <Link href={`/players/${row.playerId}`} className="flex-1 px-2 font-sans text-paper hover:text-spotlight">
                {row.fullName}
                <span className="ml-2 font-mono text-xs text-paper/40">{row.season}</span>
              </Link>
              <span className="font-mono text-xs text-spotlight">{(row.similarity * 100).toFixed(0)} %</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 pl-6 font-mono text-xs text-paper/50">
              <span>{POSITION_GROUP_LABELS[row.positionGroup]}</span>
              <span>{ageOn(row.birthDate) !== null ? `${ageOn(row.birthDate)} ans` : 'âge inconnu'}</span>
              <span>{formatMarketValue(row.marketValueEur)}</span>
              <ContractBadge contractUntil={row.contractUntil} />
              <Link href={`/compare?ids=${compareWith},${row.playerId}`} className="ml-auto underline hover:text-spotlight">
                comparer
              </Link>
            </div>
          </li>
        ))}
        {rows.length === 0 && <p className="text-sm text-paper/50">Aucun joueur ne respecte ces contraintes.</p>}
      </ol>
    </section>
  );
}
