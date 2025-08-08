'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/ui/icons';
import { Banknote, Sparkles, Target, TrendingUp } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface LoginPageProps {
  onSignIn: () => Promise<void>;
}

export function LoginPage({ onSignIn }: LoginPageProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    try {
      setIsLoading(true);
      console.info('login:clicked');
      await onSignIn();
    } catch (error) {
      console.error('Sign in error:', error);
      toast({
        title: 'Unable to start Google sign-in',
        description: 'Please try again in a moment. If the problem persists, contact support.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const features = [
    {
      icon: Banknote,
      title: 'Virtual Banking',
      description: 'Safe virtual money management with real-time interest calculations'
    },
    {
      icon: TrendingUp,
      title: 'Smart Projections',
      description: '12-month financial projections with interactive what-if scenarios'
    },
    {
      icon: Target,
      title: 'Goals & Rewards',
      description: 'Set savings goals and earn rewards for reaching milestones'
    },
    {
      icon: Sparkles,
      title: 'Real-time Updates',
      description: 'Watch balances grow with live interest updates every second'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-6xl mx-auto"
        >
          {/* Header */}
          <div className="text-center mb-12">
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl mb-6 shadow-lg"
            >
              <Banknote className="w-10 h-10 text-white" />
            </motion.div>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-4">
              Bank o&apos;Bryan
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
              A playful virtual family bank designed for kids aged 10-14. 
              Teach financial responsibility through interactive banking experiences.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Features */}
            <div className="space-y-6">
              <h2 className="text-3xl font-bold text-gray-900 mb-8">
                Why Choose Bank o'Bryan?
              </h2>
              
              <div className="grid gap-6">
                {features.map((feature, index) => (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                  >
                    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex items-start space-x-4">
                          <div className="flex-shrink-0">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                              <feature.icon className="w-6 h-6 text-white" />
                            </div>
                          </div>
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                              {feature.title}
                            </h3>
                            <p className="text-gray-600 leading-relaxed">
                              {feature.description}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Login Card */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
                <CardHeader className="text-center pb-6">
                  <CardTitle className="text-2xl font-bold text-gray-900">
                    Get Started Today
                  </CardTitle>
                  <CardDescription className="text-gray-600">
                    Sign in with your Google account to create your family banking experience
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-8 pb-8">
                  <Button
                    type="button"
                    onClick={handleSignIn}
                    disabled={isLoading}
                    size="lg"
                    variant="google"
                    className="w-full rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                  >
                    {isLoading ? (
                      <div className="flex items-center space-x-2">
                        <Icons.spinner className="w-5 h-5 animate-spin" />
                        <span>Signing in...</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-3">
                        <Icons.googleGlyph className="w-5 h-5" />
                        <span>Continue with Google</span>
                      </div>
                    )}
                  </Button>

                  <div className="mt-6 text-center">
                    <p className="text-sm text-gray-500">
                      By signing in, you agree to our terms of service and privacy policy
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Security Note */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.8 }}
                className="mt-6 p-4 bg-green-50 rounded-xl border border-green-200"
              >
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icons.check className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h4 className="font-medium text-green-900 mb-1">
                      100% Safe & Secure
                    </h4>
                    <p className="text-sm text-green-700">
                      No real money involved. All transactions are virtual and educational only.
                    </p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}