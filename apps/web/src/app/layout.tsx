import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VIVIER',
  description: 'Moteur de décision de recrutement football.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-neutral-950 text-neutral-200">{children}</body>
    </html>
  );
}
