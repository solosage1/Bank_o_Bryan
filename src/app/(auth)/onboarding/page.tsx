'use client';

import { useState } from 'react';
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
import { supabase } from '@/lib/supabase';

const familySchema = z.object({
  familyName: z.string().min(1, 'Family name is required').max(50, 'Family name too long'),
  timezone: z.string().min(1, 'Timezone is required'),
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
  const { user } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FamilyFormData>({
    resolver: zodResolver(familySchema),
    defaultValues: {
      familyName: '',
      timezone: 'America/New_York',
    },
  });

  const onSubmit = async (data: FamilyFormData) => {
    if (!user) return;

    try {
      setIsLoading(true);

      // Create family with minimal, schema-stable fields.
      const primaryPayload = {
        name: data.familyName,
        timezone: data.timezone,
      } as any;

      const { data: family, error: familyError } = await supabase
        .from('families')
        .insert([primaryPayload])
        .select('id')
        .single();

      if (familyError) throw familyError;
      if (!family) throw new Error('Family insert returned no data');

      // Create parent record
      const { error: parentError } = await supabase
        .from('parents')
        .insert([{ 
          family_id: family.id,
          email: user.email!,
          name: user.user_metadata.full_name || user.email!.split('@')[0],
          auth_user_id: user.id,
        }]);

      if (parentError) throw parentError;

      // Log audit event
      await supabase.rpc('log_audit_event', {
        p_family_id: family.id,
        p_user_type: 'parent',
        p_user_id: user.id,
        p_action: `Created family "${data.familyName}"`,
        p_entity_type: 'family',
        p_entity_id: family.id,
        p_metadata: { timezone: data.timezone }
      });

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (error) {
      console.error('Onboarding error:', error);
      form.setError('root', {
        message: error instanceof Error ? error.message : 'Failed to create family'
      });
    } finally {
      setIsLoading(false);
    }
  };

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
              Welcome to Bank o'Bryan!
            </CardTitle>
            <CardDescription className="text-lg text-gray-600">
              Let's set up your family banking environment
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
                    placeholder="The Johnson Family"
                    className="pl-11 h-12 text-base"
                    {...form.register('familyName')}
                  />
                </div>
                {form.formState.errors.familyName && (
                  <p className="mt-2 text-sm text-red-600">
                    {form.formState.errors.familyName.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="timezone" className="text-base font-medium text-gray-900">
                  Timezone
                </Label>
                <div className="mt-2 relative">
                  <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 z-10" />
                  <Select onValueChange={(value) => form.setValue('timezone', value)}>
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

              {/* Sibling visibility is always on by policy; control removed for simplicity. */}

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