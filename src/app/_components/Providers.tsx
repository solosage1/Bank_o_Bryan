'use client';

import { AuthProvider } from '@/hooks/useAuth';
import { Toaster } from '@/components/ui/toaster';
import E2EBadge from '@/app/_components/E2EBadge';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <Toaster />
      <E2EBadge />
    </AuthProvider>
  );
}

