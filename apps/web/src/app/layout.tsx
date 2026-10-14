import type { Metadata, Viewport } from 'next';
import { ReactNode } from 'react';
import '../ui/ui.css';
import '../ui/shell.css';
import { googleFontsHref, themeCss } from '../theme/theme';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'ARAM · Stock & Sales — Head Office',
  description: 'Head Office dashboard for the ARAM shop network',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href={googleFontsHref} rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
