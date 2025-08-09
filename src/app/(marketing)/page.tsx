import { Banknote, Sparkles, Target, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import dynamic from 'next/dynamic';

const SignInIsland = dynamic(() => import('@/app/_components/SignInIsland'), { ssr: false });

export default function HomePage(): JSX.Element {
  const features = [
    {
      icon: Banknote,
      title: 'Virtual Banking',
      description: 'Safe virtual money management with real-time interest calculations',
    },
    {
      icon: TrendingUp,
      title: 'Smart Projections',
      description: '12-month financial projections with interactive what-if scenarios',
    },
    {
      icon: Target,
      title: 'Goals & Rewards',
      description: 'Set savings goals and earn rewards for reaching milestones',
    },
    {
      icon: Sparkles,
      title: 'Real-time Updates',
      description: 'Watch balances grow with live interest updates every second',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl mb-6 shadow-lg">
              <Banknote className="w-10 h-10 text-white" aria-hidden="true" />
            </div>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-4">
              Bank o&apos;Bryan
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
              A playful virtual family bank designed for kids aged 10-14. Teach financial responsibility through interactive banking experiences.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Features */}
            <div className="space-y-4">
              <h2 className="text-3xl font-bold text-gray-900 mb-8">Why Choose Bank o&apos;Bryan?</h2>
              <div className="grid gap-6">
                {features.map((feature) => (
                  <Card key={feature.title} className="border-0 shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                            <feature.icon className="w-6 h-6 text-white" aria-hidden="true" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                          <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Login Card */}
            <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
              <CardHeader className="text-center pb-6">
                <CardTitle className="text-2xl font-bold text-gray-900">Get Started Today</CardTitle>
                <CardDescription className="text-gray-600">
                  Sign in with your Google account to create your family banking experience
                </CardDescription>
              </CardHeader>
              <CardContent className="px-8 pb-8">
                {/* Client island renders the interactive button and handles redirects */}
                <SignInIsland />
                {/* SSR-visible CTA fallback for non-JS environments */}
                <noscript>
                  <p className="mt-4 text-sm text-gray-500">
                    Sign-in requires JavaScript. Please enable it to continue.
                  </p>
                </noscript>
                <div className="mt-6 text-center">
                  <p className="text-sm text-gray-500">
                    By signing in, you agree to our{' '}
                    <Link prefetch={false} href="/legal/terms" className="underline underline-offset-2 hover:text-gray-700">terms of service</Link>
                    {' '}and{' '}
                    <Link prefetch={false} href="/legal/privacy" className="underline underline-offset-2 hover:text-gray-700">privacy policy</Link>.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}


