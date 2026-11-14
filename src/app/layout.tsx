import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, IBM_Plex_Sans } from 'next/font/google';
import Script from 'next/script';
import type { ReactNode } from 'react';
import './globals.css';

const display = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-barlow',
  display: 'swap',
});

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Saint-Nazaire 2027 : recherche de location',
  description:
    "Tableau de bord de recherche d'un studio ou d'un T2 à Saint-Nazaire, à vélo des Chantiers de l'Atlantique, pour janvier 2027.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e9eef1' },
    { media: '(prefers-color-scheme: dark)', color: '#08151d' },
  ],
};

/** Applique le thème avant le premier affichage pour éviter un flash clair en mode sombre. */
const themeScript = `(function(){try{var t=localStorage.getItem('immo-sn-2027:theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${display.variable} ${sans.variable}`} suppressHydrationWarning>
      <body>
        <Script id="theme-initial" strategy="beforeInteractive">
          {themeScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
