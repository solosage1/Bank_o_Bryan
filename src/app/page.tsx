'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoginPage } from '@/components/auth/LoginPage';
import { useAuth } from '@/hooks/useAuth';

export default function HomePage() {
  const { user, parent, family, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!loading) {
      setIsInitialized(true);
      
      if (user && parent && family) {
        router.push('/dashboard');
      } else if (user && !parent) {
        router.push('/onboarding');
      }
    }
  }, [user, parent, family, loading, router]);

  if (loading || !isInitialized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading Bank o'Bryan...</p>
        </div>
      </div>
    );
  }

  return <LoginPage onSignIn={signInWithGoogle} />;
}