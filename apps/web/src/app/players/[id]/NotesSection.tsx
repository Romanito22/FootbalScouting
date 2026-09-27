import { desc, eq } from 'drizzle-orm';
import { NotebookPen } from 'lucide-react';
import { db, scoutNotes } from '@vivier/db';
import { btnPrimary, EmptyState, field, label } from '@/components/ui';
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
    <div className="grid gap-6 lg:grid-cols-5">
      <form action={addNote} className="space-y-3 lg:col-span-2">
        <input type="hidden" name="playerId" value={playerId} />
        <label className={label}>
          Contexte
          <input type="text" name="context" placeholder="vs OM, 12/03, entré 78e" className={`${field} mt-1`} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            Date d'observation
            <input type="date" name="observedAt" className={`${field} mt-1`} />
          </label>
          <label className={label}>
            Note /10
            <input type="number" name="rating" min={1} max={10} className={`${field} mt-1`} />
          </label>
        </div>
        <label className={label}>
          Observation
          <textarea name="body" required rows={4} placeholder="Ce que les chiffres ne disent pas…" className={`${field} mt-1`} />
        </label>
        <button type="submit" className={btnPrimary}>Ajouter la note</button>
      </form>

      <div className="lg:col-span-3">
        {notes.length === 0 ? (
          <EmptyState icon={<NotebookPen size={28} />} title="Aucune observation">
            Les notes de terrain complètent les chiffres : contexte du match, attitude, ce qui ne se mesure pas.
          </EmptyState>
        ) : (
          <ol className="relative space-y-4 border-l border-line pl-5">
            {notes.map((note) => (
              <li key={note.id} className="relative">
                <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-spotlight ring-4 ring-surface" aria-hidden="true" />
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-paper/50">
                  <span>
                    {note.context ?? 'Sans contexte'}
                    {note.observedAt && ` · ${new Date(note.observedAt).toLocaleDateString('fr-FR')}`}
                  </span>
                  {note.rating !== null && (
                    <span className="rounded-full border border-spotlight/40 px-2 font-semibold text-spotlight">{note.rating}/10</span>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-paper/90">{note.body}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
