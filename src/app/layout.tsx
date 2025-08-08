import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '@/hooks/useAuth';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://bankobryan.netlify.app'),
  title: 'Bank o\'Bryan - Family Banking for Kids',
  description: 'A playful virtual family bank designed for kids aged 10-14. Teach financial responsibility through interactive banking experiences.',
  keywords: ['family banking', 'kids finance', 'virtual money', 'financial education', 'children savings'],
  authors: [{ name: 'Bank o\'Bryan Team' }],
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/favicon.ico',
  },
  openGraph: {
    title: 'Bank o\'Bryan - Family Banking for Kids',
    description: 'A playful virtual family bank designed for kids aged 10-14',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}