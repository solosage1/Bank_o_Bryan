import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/hooks/useAuth';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Bank o\'Bryan - Family Banking for Kids',
  description: 'A playful virtual family bank designed for kids aged 10-14. Teach financial responsibility through interactive banking experiences.',
  keywords: ['family banking', 'kids finance', 'virtual money', 'financial education', 'children savings'],
  authors: [{ name: 'Bank o\'Bryan Team' }],
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
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}