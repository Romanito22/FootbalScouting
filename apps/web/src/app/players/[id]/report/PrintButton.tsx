'use client';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden border border-spotlight px-4 py-1.5 text-sm text-spotlight hover:bg-spotlight/10"
    >
      Imprimer / exporter en PDF
    </button>
  );
}
