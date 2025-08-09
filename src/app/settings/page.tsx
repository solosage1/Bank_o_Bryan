"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export default function SettingsPage() {
  const router = useRouter();
  const { user, family, loading } = useAuth();
  const [familyName, setFamilyName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/');
      return;
    }
    if (family) {
      setFamilyName(family.name || '');
      setTimezone(family.timezone || '');
    }
  }, [loading, user, family, router]);

  const save = async () => {
    if (!family) return;
    try {
      setSaving(true);
      await supabase
        .from('families')
        .update({ name: familyName, timezone })
        .eq('id', family.id);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <Button variant="outline" onClick={() => router.push('/dashboard')}>Back to Dashboard</Button>
        </div>

        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle>Family</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="familyName">Family Name</Label>
              <Input id="familyName" value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="America/Los_Angeles" />
            </div>
            <div className="pt-2">
              <Button onClick={save} disabled={saving || !familyName.trim()}>Save Changes</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


