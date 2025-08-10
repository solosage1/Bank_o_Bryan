'use client';

import { AuthProvider } from '@/hooks/useAuth';
import { Toaster } from '@/components/ui/toaster';
import dynamic from 'next/dynamic';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

export default function Providers({ children }: { children: React.ReactNode }) {
  const E2EBadge = dynamic(() => import('@/app/_components/E2EBadge'), { ssr: false, loading: () => null });
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
        {process.env.NEXT_PUBLIC_E2E === '1' ? <E2EBadge /> : null}
      </QueryClientProvider>
    </AuthProvider>
  );
}

