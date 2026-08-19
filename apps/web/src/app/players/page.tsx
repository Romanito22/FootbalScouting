import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { clubs, db, players, playerSeasonStats } from '@vivier/db';
import { POSITION_GROUP_LABELS } from '@vivier/metrics';

export default async function PlayersPage() {
  const rows = await db
    .select({
      id: players.id,
      fullName: players.fullName,
      positionGroup: players.positionGroup,
      season: playerSeasonStats.season,
      minutes: playerSeasonStats.minutes,
      clubName: clubs.name,
    })
    .from(playerSeasonStats)
    .innerJoin(players, eq(players.id, playerSeasonStats.playerId))
    .innerJoin(clubs, eq(clubs.id, playerSeasonStats.clubId))
    .orderBy(desc(playerSeasonStats.minutes));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 font-display text-2xl font-bold tracking-tight text-paper">
        Joueurs
      </h1>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-paper/20 text-left text-paper/50">
            <th className="py-1.5 font-normal">Nom</th>
            <th className="py-1.5 font-normal">Poste</th>
            <th className="py-1.5 font-normal">Équipe</th>
            <th className="py-1.5 font-normal">Saison</th>
            <th className="py-1.5 text-right font-normal">Minutes</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-paper/10 hover:bg-surface">
              <td className="py-1.5 font-sans">
                <Link href={`/players/${row.id}`} className="hover:text-spotlight">
                  {row.fullName}
                </Link>
              </td>
              <td className="py-1.5">{POSITION_GROUP_LABELS[row.positionGroup]}</td>
              <td className="py-1.5 font-sans">{row.clubName}</td>
              <td className="py-1.5">{row.season}</td>
              <td className="py-1.5 text-right">{row.minutes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
