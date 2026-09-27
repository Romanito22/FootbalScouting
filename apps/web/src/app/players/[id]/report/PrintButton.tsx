'use client';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-md bg-spotlight px-3 py-1.5 text-sm font-semibold text-ink hover:brightness-110 print:hidden"
    >
      Imprimer / exporter en PDF
    </button>
  );
}
