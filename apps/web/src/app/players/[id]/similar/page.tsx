import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, players, playerVectors } from '@vivier/db';
import { Sparkles } from 'lucide-react';
import { MIN_MINUTES, POSITION_GROUP_LABELS } from '@vivier/metrics';
import { ContractBadge } from '@/components/ContractBadge';
import { btnPrimary, Card, EmptyState, field, label, Monogram, PageHeader } from '@/components/ui';
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
    <main className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
      <PageHeader
        eyebrow={<Link href={`/players/${playerId}`} className="hover:text-spotlight">← {player.fullName}</Link>}
        title="Qui pour le remplacer ?"
        description="Même profil de jeu (style) ou même niveau (ajusté du championnat), sous tes contraintes de recrutement."
      />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-4 rounded-xl border border-line bg-surface p-4">
        <input type="hidden" name="submitted" value="1" />
        <label className="flex items-center gap-2 self-center text-sm text-paper">
          <input type="checkbox" name="samePosition" value="1" defaultChecked={samePosition} />
          Même poste ({POSITION_GROUP_LABELS[player.positionGroup]})
        </label>
        <label className={`${label} w-28`}>Âge max<input type="number" name="ageMax" defaultValue={constraints.ageMax ?? ''} className={`${field} mt-1`} /></label>
        <label className={`${label} w-40`}>Valeur max (€)<input type="number" name="marketValueMax" defaultValue={constraints.marketValueMax ?? ''} className={`${field} mt-1`} /></label>
        <label className={`${label} w-44`}>Fin de contrat avant<input type="date" name="contractBefore" defaultValue={constraints.contractBefore ?? ''} className={`${field} mt-1`} /></label>
        <button type="submit" className={btnPrimary}>Appliquer</button>
        {hasConstraints && (
          <p className="basis-full text-xs text-paper/45">Âge, valeur et contrat ne filtrent que les joueurs pour qui la donnée est connue (import Transfermarkt).</p>
        )}
      </form>

      {!target || !target.styleVec || !target.qualityVec ? (
        <EmptyState icon={<Sparkles size={28} />} title="Pas de vecteur pour ce joueur">
          Moins de {MIN_MINUTES} minutes jouées, ou pnpm pipeline:refresh n'a pas encore tourné.
        </EmptyState>
      ) : (
        <>
          <p className="mb-4 text-xs text-paper/45">
            Référence : saison {target.season} (la plus récente avec vecteur) · modèle {target.modelVersion} ·
            similarité cosinus : 100 % = même proportion de jeu (style) ou même profil de percentiles (niveau) —
            une distance, pas une estimation statistique ; fiable si les groupes de pairs sont fournis.
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            <SimilarList
              title="Même style"
              subtitle="joue comme lui : mêmes proportions dans son jeu"
              rows={await topSimilar(playerVectors.styleVec, target.styleVec, playerId, RESULT_LIMIT, constraints)}
              compareWith={playerId}
            />
            <SimilarList
              title="Même niveau"
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
    <Card title={title} subtitle={subtitle} padded={false}>
      {rows.length === 0 ? (
        <p className="p-5 text-sm text-paper/50">Aucun joueur ne respecte ces contraintes.</p>
      ) : (
        <ol className="divide-y divide-line">
          {rows.map((row, i) => (
            <li key={row.playerId} className="flex items-center gap-3 px-5 py-3">
              <span className="w-5 font-mono text-xs text-paper/35">{i + 1}</span>
              <Monogram name={row.fullName} size="sm" />
              <div className="min-w-0 flex-1">
                <Link href={`/players/${row.playerId}`} className="block truncate font-medium text-paper hover:text-spotlight">{row.fullName}</Link>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-paper/50">
                  <span>{POSITION_GROUP_LABELS[row.positionGroup]} · {row.season}</span>
                  {ageOn(row.birthDate) !== null && <span>· {ageOn(row.birthDate)} ans</span>}
                  {row.marketValueEur !== null && <span>· {formatMarketValue(row.marketValueEur)}</span>}
                  {row.contractUntil && <ContractBadge contractUntil={row.contractUntil} />}
                </div>
              </div>
              <div className="num w-14 text-right text-sm font-semibold text-paper" title="Similarité cosinus">
                {(row.similarity * 100).toFixed(0)} %
              </div>
              <Link href={`/compare?ids=${compareWith},${row.playerId}`} className="text-xs text-paper/45 underline hover:text-spotlight">comparer</Link>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
