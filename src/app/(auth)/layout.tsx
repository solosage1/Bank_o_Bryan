"use client";

import { AuthProvider } from '@/hooks/useAuth';
import { Toaster } from '@/components/ui/toaster';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <Toaster />
    </AuthProvider>
  );
}


