'use client';

import { AuthProvider } from '@/hooks/useAuth';
import { Toaster } from '@/components/ui/toaster';
import E2EBadge from '@/app/_components/E2EBadge';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
        <E2EBadge />
      </QueryClientProvider>
    </AuthProvider>
  );
}

