import { desc, eq } from 'drizzle-orm';
import { db, scoutNotes } from '@vivier/db';
import { addNote } from './actions';

/**
 * L'œil humain — la seule donnée du projet qui n'existe nulle part
 * ailleurs (spec §3.6). C'est ce qui rend l'app tienne.
 */
export async function NotesSection({ playerId }: { playerId: number }) {
  const notes = await db
    .select()
    .from(scoutNotes)
    .where(eq(scoutNotes.playerId, playerId))
    .orderBy(desc(scoutNotes.createdAt));

  return (
    <section className="mb-10 border-t border-paper/15 pt-6">
      <h2 className="mb-4 font-display text-xl font-bold text-paper">Notes de scouting</h2>

      <form action={addNote} className="mb-6 space-y-2 border border-paper/15 p-3">
        <input type="hidden" name="playerId" value={playerId} />
        <div className="flex flex-wrap gap-2">
          <input
            type="text" name="context" placeholder="Contexte (ex. vs OM, 12/03, entré 78e)"
            className="flex-1 border border-paper/30 bg-ink px-2 py-1 text-sm text-paper"
          />
          <input type="date" name="observedAt" className="border border-paper/30 bg-ink px-2 py-1 text-sm text-paper" />
          <input
            type="number" name="rating" min={1} max={10} placeholder="Note /10"
            className="w-24 border border-paper/30 bg-ink px-2 py-1 text-sm text-paper"
          />
        </div>
        <textarea
          name="body" required rows={3} placeholder="Observation..."
          className="w-full border border-paper/30 bg-ink px-2 py-1 text-sm text-paper"
        />
        <button type="submit" className="border border-pitch/50 px-3 py-1.5 text-sm text-pitch hover:border-pitch hover:bg-pitch/10">
          Ajouter la note
        </button>
      </form>

      {notes.length === 0 && <p className="text-sm text-paper/50">Aucune note pour l'instant.</p>}

      <div className="space-y-4">
        {notes.map((note) => (
          <article key={note.id} className="border-b border-paper/10 pb-3">
            <div className="mb-1 flex items-baseline justify-between font-mono text-xs text-paper/50">
              <span>
                {note.context ?? '—'}
                {note.observedAt && ` · ${new Date(note.observedAt).toLocaleDateString('fr-FR')}`}
              </span>
              {note.rating !== null && <span className="text-spotlight">{note.rating}/10</span>}
            </div>
            <p className="whitespace-pre-wrap text-sm text-paper/90">{note.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
