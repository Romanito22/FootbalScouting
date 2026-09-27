/** Squelette pendant le rendu serveur d'une page (requêtes en cours). */
export default function Loading() {
  return (
    <main className="mx-auto max-w-7xl animate-pulse px-6 py-8 lg:px-10" aria-busy="true" aria-label="Chargement">
      <div className="mb-2 h-3 w-24 rounded bg-raised" />
      <div className="mb-8 h-9 w-72 rounded bg-raised" />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 rounded-xl border border-line bg-surface" />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-72 rounded-xl border border-line bg-surface" />
        <div className="h-72 rounded-xl border border-line bg-surface" />
      </div>
    </main>
  );
}
