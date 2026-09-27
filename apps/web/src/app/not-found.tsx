import Link from 'next/link';
import { btnPrimary } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-6 py-24 text-center">
      <div className="font-display text-6xl font-bold text-paper/20">404</div>
      <h1 className="mt-2 font-display text-2xl font-bold text-paper">Introuvable</h1>
      <p className="mt-2 text-sm text-paper/55">Ce joueur, cette shortlist ou cette page n'existe pas (ou plus).</p>
      <Link href="/" className={`${btnPrimary} mt-6`}>Retour au tableau de bord</Link>
    </main>
  );
}
