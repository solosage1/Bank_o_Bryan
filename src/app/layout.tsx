import './globals.css';
import type { Metadata } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://bankobryan.netlify.app';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Bank o'Bryan - Family Banking for Kids",
  description:
    'A playful virtual family bank designed for kids aged 10-14. Teach financial responsibility through interactive banking experiences.',
  keywords: ['family banking', 'kids finance', 'virtual money', 'financial education', 'children savings'],
  authors: [{ name: "Bank o'Bryan Team" }],
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon', sizes: '180x180', type: 'image/png' }],
    shortcut: ['/favicon.ico', '/icon'],
  },
  openGraph: {
    title: "Bank o'Bryan - Family Banking for Kids",
    description: 'A playful virtual family bank designed for kids aged 10-14',
    type: 'website',
    url: SITE_URL,
    images: [
      {
        url: `${SITE_URL}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "Bank o'Bryan",
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: [`${SITE_URL}/opengraph-image`],
    title: "Bank o'Bryan - Family Banking for Kids",
    description:
      'A playful virtual family bank designed for kids aged 10-14. Teach financial responsibility through interactive banking experiences.',
  },
  alternates: {
    canonical: SITE_URL,
  },
  themeColor: '#ffffff',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <noscript>
          <div className="nojs-notice">
            For sign-in and app functionality, please enable JavaScript. You can still read about Bank o&apos;Bryan below.
          </div>
        </noscript>
        {children}
      </body>
    </html>
  );
}