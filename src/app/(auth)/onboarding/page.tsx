'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Users, Home, Clock, ArrowRight } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useRedirectOnReady } from '@/hooks/useRedirectOnReady';
import { supabase } from '@/lib/supabase';
import { track } from '@/components/analytics/track';

const familySchema = z.object({
  familyName: z.string().min(1, 'Family name is required').max(50, 'Family name too long'),
  timezone: z.string().min(1, 'Timezone is required'),
  siblingVisibility: z.boolean().optional(),
});

type FamilyFormData = z.infer<typeof familySchema>;

const timezones = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
];

export default function OnboardingPage() {
  const { user, refreshProfile } = useAuth();
  const status = useRequireAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  // If the user is already fully onboarded, leave this page immediately.
  useRedirectOnReady(status, '/dashboard');

  const form = useForm<FamilyFormData>({
    resolver: zodResolver(familySchema),
    defaultValues: {
      familyName: '',
      timezone: 'America/New_York',
      siblingVisibility: true,
    },
  });

  // Ensure no stray autofill or stale state on mount
  useEffect(() => {
    form.reset({ familyName: '', timezone: 'America/New_York', siblingVisibility: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (data: FamilyFormData) => {
    const isBypass = process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === '1' || (user && user.id === 'e2e-user') ||
      (typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('e2e') === '1' || window.localStorage.getItem('E2E_BYPASS') === '1'));

    try {
      setIsLoading(true);
      track('family_created', { phase: 'attempt', tz: data.timezone, name_length: data.familyName.length });

      // E2E bypass: simulate successful onboarding without backend
      if (isBypass) {
        try {
          // Persist E2E_FAMILY so the auth context can hydrate family on next render
          if (typeof window !== 'undefined') {
            const payload = {
              id: 'fam-e2e',
              name: data.familyName,
              timezone: data.timezone,
              sibling_visibility: data.siblingVisibility ?? true,
              created_at: ''
            };
            window.localStorage.setItem('E2E_FAMILY', JSON.stringify(payload));
            // Ensure a parent exists in bypass
            if (!window.localStorage.getItem('E2E_PARENT')) {
              window.localStorage.setItem('E2E_PARENT', JSON.stringify({ id: 'p-e2e', name: 'E2E Parent' }));
            }
          }
          await refreshProfile();
        } finally {
          await new Promise((r) => setTimeout(r, 50));
          router.push('/dashboard');
        }
        return;
      }

      if (!user) throw new Error('Not authenticated');

      // Ensure an active session exists before hitting authenticated RPCs
      // This defensively avoids races where the access token isn't yet ready after OAuth redirect
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        throw new Error('No authenticated session available for onboarding');
      }

      // Use idempotent onboarding RPC to create or fetch family
      const { data: familyId, error: rpcError } = await supabase.rpc('onboard_family', {
        p_name: data.familyName,
        p_timezone: data.timezone,
      });

      if (rpcError) throw rpcError as any;
      if (!familyId) throw new Error('onboard_family returned no family id');

      // Persist sibling visibility preference immediately after onboarding
      try {
        const { error: updateError } = await supabase
          .from('families')
          .update({ sibling_visibility: data.siblingVisibility ?? true })
          .eq('id', familyId as string);
        if (updateError) throw updateError;
      } catch (updateErr) {
        console.warn('Failed to update sibling visibility (non-blocking):', updateErr);
      }

      // Log audit event (non-blocking)
      (async () => {
        try {
          await supabase.rpc('log_audit_event', {
            p_family_id: familyId as any,
            p_user_type: 'parent',
            p_user_id: user.id,
            p_action: `Created family \"${data.familyName}\"`,
            p_entity_type: 'family',
            p_entity_id: familyId as any,
            p_metadata: { timezone: data.timezone, sibling_visibility: data.siblingVisibility ?? true }
          });
        } catch (rpcError: unknown) {
          console.warn('Audit log RPC failed (non-blocking):', rpcError);
        }
      })();

      // Refresh auth context so guards see the new family immediately, then redirect
      await refreshProfile();
      track('family_created', { phase: 'success', familyId });
      router.replace('/dashboard');
    } catch (error) {
      console.error('Onboarding error:', error);
      const err: any = error;
      const details: string[] = [];
      if (err?.message) details.push(String(err.message));
      if (err?.code) details.push(`code: ${err.code}`);
      if (err?.details) details.push(String(err.details));
      if (err?.hint) details.push(String(err.hint));
      const message = details.length ? details.join(' — ') : 'Failed to create family';
      form.setError('root', { message });
      track('family_created', { phase: 'failure', message, code: err?.code, details: err?.details, hint: err?.hint });
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'loading') {
    // In E2E bypass, skip the loading gate to render the form
    const isBypass = process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === '1' || (typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('e2e') === '1' || window.localStorage.getItem('E2E_BYPASS') === '1'));
    if (!isBypass) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Preparing onboarding...</p>
          <button
            className="mt-4 px-3 py-2 rounded-md border border-gray-300 text-gray-700 text-sm hover:bg-gray-50"
            onClick={async () => {
              try {
                await supabase.auth.signOut();
              } finally {
                router.replace('/');
              }
            }}
          >
            Reset session
          </button>
        </div>
      </div>
    );
    }
  }

  if (status === 'ready') {
    // Short transition UI while the router performs the replace
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-2xl w-full"
      >
        <Card className="shadow-xl border-0">
          <CardHeader className="text-center pb-8">
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl mx-auto mb-6"
            >
              <Home className="w-8 h-8 text-white" />
            </motion.div>
            <CardTitle className="text-3xl font-bold text-gray-900 mb-2">
              Welcome to Bank o&apos;Bryan!
            </CardTitle>
            <CardDescription className="text-lg text-gray-600">
              Let&apos;s set up your family banking environment
            </CardDescription>
          </CardHeader>

          <CardContent className="px-8 pb-8">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <Label htmlFor="familyName" className="text-base font-medium text-gray-900">
                  Family Name
                </Label>
                <div className="mt-2 relative">
                  <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Input
                    id="familyName"
                    placeholder="e.g., The Johnson Family"
                    className="pl-11 h-12 text-base"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    {...form.register('familyName')}
                  />
                </div>
                {form.formState.errors.familyName && (
                  <p className="mt-2 text-sm text-red-600">
                    {form.formState.errors.familyName.message}
                  </p>
                )}
                <p className="mt-2 text-sm text-gray-500">Enter your family name.</p>
              </div>

              <div>
                <Label htmlFor="timezone" className="text-base font-medium text-gray-900">
                  Timezone
                </Label>
                <div className="mt-2 relative">
                  <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 z-10" />
                  <Select 
                    onValueChange={(value) => form.setValue('timezone', value)}
                    defaultValue={form.getValues('timezone')}
                  >
                    <SelectTrigger className="pl-11 h-12 text-base">
                      <SelectValue placeholder="Select your timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {timezones.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.formState.errors.timezone && (
                  <p className="mt-2 text-sm text-red-600">
                    {form.formState.errors.timezone.message}
                  </p>
                )}
                <p className="mt-2 text-sm text-gray-500">
                  This helps us calculate interest at the right time for your family
                </p>
              </div>

              <div>
                <Label htmlFor="siblingVisibility" className="text-base font-medium text-gray-900">
                  Sibling Visibility
                </Label>
                <div className="mt-2 flex items-center justify-between rounded-lg border border-gray-200 p-4">
                  <div>
                    <p className="text-gray-900 font-medium">Allow siblings to view each other’s balances</p>
                    <p className="text-sm text-gray-500">You can change this later in family settings.</p>
                  </div>
                  <Switch
                    id="siblingVisibility"
                    checked={form.watch('siblingVisibility')}
                    onCheckedChange={(v) => form.setValue('siblingVisibility', v)}
                    aria-describedby="siblingVisibility-help"
                  />
                </div>
                <span id="siblingVisibility-help" className="sr-only">
                  Toggle whether children can see each other’s accounts
                </span>
              </div>

              {form.formState.errors.root && (
                <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                  {form.formState.errors.root.message}
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 text-base bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl font-medium"
              >
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Creating Family...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <span>Create Family</span>
                    <ArrowRight className="w-5 h-5" />
                  </div>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}