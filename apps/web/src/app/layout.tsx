import type { Metadata } from 'next';
import { Archivo_Narrow, IBM_Plex_Mono, Inter_Tight } from 'next/font/google';
import './globals.css';

const archivoCondensed = Archivo_Narrow({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
});

const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-text',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'VIVIER',
  description: 'Moteur de décision de recrutement football.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${archivoCondensed.variable} ${interTight.variable} ${ibmPlexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
