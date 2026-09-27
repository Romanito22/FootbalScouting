import type { Metadata } from 'next';
import { Archivo_Narrow, IBM_Plex_Mono, Inter_Tight } from 'next/font/google';
import { Nav } from '@/components/Nav';
import './globals.css';

const archivoNarrow = Archivo_Narrow({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--ff-display',
});

const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--ff-text',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--ff-mono',
});

export const metadata: Metadata = {
  title: { default: 'VIVIER', template: '%s · VIVIER' },
  description: 'Moteur de décision de recrutement football.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${archivoNarrow.variable} ${interTight.variable} ${ibmPlexMono.variable}`}>
      <body className="min-h-screen">
        <Nav />
        <div className="lg:pl-60 print:pl-0">{children}</div>
      </body>
    </html>
  );
}
