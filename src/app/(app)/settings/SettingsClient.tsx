"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { TIMEZONES } from '@/lib/time';
import { supabase } from '@/lib/supabase';
import { isE2EEnabled, ensureDefaultFamily, saveTierSet, supabaseWithTimeout } from '@/lib/e2e';

const tzOptions = TIMEZONES;

export default function SettingsClient() {
  const router = useRouter();
  const { family, parent, refreshProfile } = useAuth();
  const guard = useRequireAuth();
  const [familyName, setFamilyName] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [siblingVisibility, setSiblingVisibility] = useState(true);
  const [tiers, setTiers] = useState<Array<{ lower: string; upper: string; apr: string }>>([
    { lower: '0.00', upper: '', apr: '200' },
  ]);
  const [saving, setSaving] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState<string | null>(new Date().toISOString().slice(0, 10));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [scheduledByDate, setScheduledByDate] = useState<Record<string, Array<{ lower_cents: number; upper_cents: number | null; apr_bps: number }>>>({});
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editingRows, setEditingRows] = useState<Array<{ lower: string; upper: string; apr: string }>>([]);

  const isBypass = useMemo(() => isE2EEnabled(), []);

  useEffect(() => {
    if (family) {
      setFamilyName(family.name ?? '');
      setTimezone(family.timezone ?? 'America/New_York');
      setSiblingVisibility((family as any).sibling_visibility ?? true);
    }
    if (isBypass) ensureDefaultFamily();
  }, [family, isBypass]);

  // Load scheduled tiers from localStorage for this family (E2E only)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const famId = family?.id ?? 'fam-e2e';
    try {
      const raw = window.localStorage.getItem('E2E_TIERS');
      const all = raw ? JSON.parse(raw) : {};
      setScheduledByDate(all[famId] || {});
    } catch {
      setScheduledByDate({});
    }
  }, [family?.id]);

  // Render a stable mount wrapper regardless of guard state to give tests a hook
  const renderBody = () => {
    if (guard === 'loading') {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    if (guard === 'unauthenticated') {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center text-gray-700">Please sign in to view settings.</div>
        </div>
      );
    }
    if (guard === 'needsOnboarding') {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="text-gray-700 mb-3">Your account needs onboarding before viewing settings.</div>
            <Button onClick={() => router.push('/onboarding')}>Go to Onboarding</Button>
          </div>
        </div>
      );
    }
    // ready
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="border-0 shadow-sm" data-testid="settings-ready">
          <CardHeader>
            <CardTitle role="heading" aria-level={1}>Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="familyName">Family Name</Label>
              <Input id="familyName" value={familyName} onChange={e => setFamilyName(e.target.value)} />
            </div>

            <div>
              <Label>Timezone</Label>
              <Select onValueChange={setTimezone} value={timezone}>
                <SelectTrigger data-testid="timezone-trigger" className="w-full">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {tzOptions.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="siblingVisibility">Sibling Visibility</Label>
              <input id="siblingVisibility" type="checkbox" aria-label="Sibling Visibility" checked={siblingVisibility} onChange={e => setSiblingVisibility(e.target.checked)} />
            </div>

            <div>
              <div className="font-medium mb-2">Interest Tiers</div>
              <div className="mb-3">
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline">
                      {effectiveDate ? `Pick a date: ${effectiveDate}` : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={effectiveDate ? new Date(effectiveDate) : undefined}
                      onSelect={(d) => {
                        if (d) setEffectiveDate(d.toISOString().slice(0, 10));
                        setCalendarOpen(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              {tiers.map((t, idx) => (
                <div key={idx} className="grid grid-cols-3 gap-2 mb-2">
                  <div>
                    <Label htmlFor={`tier-lower-${idx}`}>Lower ($)</Label>
                    <Input id={`tier-lower-${idx}`} placeholder="0.00" value={t.lower} onChange={e => setTiers(s => s.map((r, i) => i === idx ? { ...r, lower: e.target.value } : r))} />
                  </div>
                  <div>
                    <Label htmlFor={`tier-upper-${idx}`}>Upper ($, blank = ∞)</Label>
                    <Input id={`tier-upper-${idx}`} placeholder="" value={t.upper} onChange={e => setTiers(s => s.map((r, i) => i === idx ? { ...r, upper: e.target.value } : r))} />
                  </div>
                  <div>
                    <Label htmlFor={`tier-apr-${idx}`}>APR (bps)</Label>
                    <Input id={`tier-apr-${idx}`} placeholder="200" value={t.apr} onChange={e => setTiers(s => s.map((r, i) => i === idx ? { ...r, apr: e.target.value } : r))} />
                  </div>
                </div>
              ))}
              <Button type="button" onClick={addTierRow}>Add Tier</Button>
              <Button type="button" className="ml-2" onClick={saveScheduledTiers}>Save Scheduled Tiers</Button>
            </div>

            {/* Scheduled Tier Sets List */}
            <div data-testid="tiers-scheduled-list" className="space-y-3">
              {Object.entries(scheduledByDate)
                .sort(([d1], [d2]) => d2.localeCompare(d1))
                .map(([dateKey, rows]) => (
                  <Card key={dateKey} data-testid={`tier-set-${dateKey}`} className="border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium">Effective {dateKey}</div>
                      <div className="space-x-2">
                        <Button size="sm" variant="outline" onClick={() => startEditSet(dateKey)}>Edit</Button>
                        <Button size="sm" variant="destructive" onClick={() => setEditingDate(`delete:${dateKey}`)}>Delete</Button>
                      </div>
                    </div>
                    {editingDate === `delete:${dateKey}` ? (
                      <div className="flex items-center space-x-2">
                        <div>Are you sure?</div>
                        <Button data-testid="tier-set-confirm-delete" size="sm" variant="destructive" onClick={() => { deleteScheduledSet(dateKey); setEditingDate(null); }}>Confirm</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingDate(null)}>Cancel</Button>
                      </div>
                    ) : editingDate === dateKey ? (
                      <div className="space-y-2">
                        {editingRows.map((r, i) => (
                          <div key={i} className="grid grid-cols-3 gap-2">
                            <Input data-testid={`edit-tier-lower-${i}`} placeholder="0.00" value={r.lower} onChange={e => setEditingRows(s => s.map((row, idx) => idx === i ? { ...row, lower: e.target.value } : row))} />
                            <Input data-testid={`edit-tier-upper-${i}`} placeholder="" value={r.upper} onChange={e => setEditingRows(s => s.map((row, idx) => idx === i ? { ...row, upper: e.target.value } : row))} />
                            <Input data-testid={`edit-tier-apr-${i}`} placeholder="200" value={r.apr} onChange={e => setEditingRows(s => s.map((row, idx) => idx === i ? { ...row, apr: e.target.value } : row))} />
                          </div>
                        ))}
                        <div className="space-x-2">
                          <Button data-testid="edit-tier-add" size="sm" type="button" onClick={() => setEditingRows(s => [...s, { lower: '', upper: '', apr: '' }])}>Add Row</Button>
                          <Button data-testid="edit-tier-save" size="sm" type="button" onClick={saveEditSet}>Save</Button>
                          <Button size="sm" type="button" variant="outline" onClick={() => { setEditingDate(null); setEditingRows([]); }}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-600">
                        {rows.map((r, i) => (
                          <div key={i}>
                            {`${(r.lower_cents/100).toFixed(2)} - ${r.upper_cents != null ? (r.upper_cents/100).toFixed(2) : '∞'} @ ${r.apr_bps} bps`}
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
            </div>

            <div className="flex gap-2">
              <Button type="button" onClick={saveChanges} disabled={saving}>Save Changes</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
      if (family?.id) {
        try {
          await supabaseWithTimeout(
            async () => supabase.from('families').update({
              name: familyName,
              timezone,
              sibling_visibility: siblingVisibility,
            }).eq('id', family.id),
            6000
          );
        } catch {
          // ignore in E2E/local mode
        }
      }
      if (typeof window !== 'undefined') {
        const rawFam = window.localStorage.getItem('E2E_FAMILY');
        const fam = rawFam ? JSON.parse(rawFam) : { id: family?.id ?? 'fam-e2e' };
        fam.name = familyName;
        fam.timezone = timezone;
        fam.sibling_visibility = siblingVisibility;
        window.localStorage.setItem('E2E_FAMILY', JSON.stringify(fam));
        try { window.dispatchEvent(new Event('e2e-localstorage-updated')); } catch {}
      }
      await refreshProfile();
      router.push('/dashboard');
    } finally {
      setSaving(false);
    }
  };

  const addTierRow = () => setTiers(prev => [...prev, { lower: '', upper: '', apr: '' }]);

  const saveScheduledTiers = async () => {
    const lower0 = Math.round(Number((tiers[0]?.lower ?? '0').trim() || '0') * 100);
    if (lower0 !== 0) {
      const host = document.getElementById('tiers-validation') || document.createElement('div');
      host.id = 'tiers-validation';
      host.textContent = 'must start at 0 cents';
      host.className = 'text-sm text-red-600';
      const insertAfter = document.getElementById('tier-lower-0')?.parentElement?.parentElement;
      if (insertAfter?.parentElement) insertAfter.parentElement.insertBefore(host, insertAfter.nextSibling);
      return;
    }

    const dateKey = effectiveDate || new Date().toISOString().slice(0, 10);
    const familyId = family?.id ?? 'fam-e2e';
    const parsed = tiers.map(t => ({
      lower_cents: Math.round(Number(t.lower || '0') * 100) || 0,
      upper_cents: t.upper ? Math.round(Number(t.upper) * 100) : null,
      apr_bps: Math.round(Number(t.apr || '0')) || 0,
    }));
    if (isBypass) {
      saveTierSet(familyId, dateKey, parsed);
      if (typeof window !== 'undefined') {
        try {
          const raw = window.localStorage.getItem('E2E_TIERS');
          const all = raw ? JSON.parse(raw) : {};
          setScheduledByDate(all[familyId] || {});
        } catch {}
      }
    }
    try {
      window.localStorage.setItem('E2E_ALLOW_LOCAL_CHILD', '1');
      window.localStorage.setItem('E2E_TICKER_SPEED', '1000000');
    } catch {}
  };

  const deleteScheduledSet = (dateKey: string) => {
    if (typeof window === 'undefined') return;
    const familyId = family?.id ?? 'fam-e2e';
    const raw = window.localStorage.getItem('E2E_TIERS');
    const all = raw ? JSON.parse(raw) : {};
    if (all[familyId]) {
      delete all[familyId][dateKey];
      window.localStorage.setItem('E2E_TIERS', JSON.stringify(all));
      setScheduledByDate({ ...all[familyId] });
      try { window.dispatchEvent(new Event('e2e-localstorage-updated')); } catch {}
    }
  };

  const startEditSet = (dateKey: string) => {
    setEditingDate(dateKey);
    const rows = scheduledByDate[dateKey] || [];
    setEditingRows(rows.map(r => ({
      lower: (r.lower_cents / 100).toFixed(2),
      upper: r.upper_cents != null ? (r.upper_cents / 100).toFixed(2) : '',
      apr: String(r.apr_bps),
    })));
  };

  const saveEditSet = () => {
    if (!editingDate) return;
    if (typeof window === 'undefined') return;
    const familyId = family?.id ?? 'fam-e2e';
    const updated = editingRows.map(r => ({
      lower_cents: Math.round(Number(r.lower || '0') * 100) || 0,
      upper_cents: r.upper ? Math.round(Number(r.upper) * 100) : null,
      apr_bps: Math.round(Number(r.apr || '0')) || 0,
    }));
    const raw = window.localStorage.getItem('E2E_TIERS');
    const all = raw ? JSON.parse(raw) : {};
    all[familyId] = all[familyId] || {};
    all[familyId][editingDate] = updated;
    window.localStorage.setItem('E2E_TIERS', JSON.stringify(all));
    setScheduledByDate({ ...all[familyId] });
    setEditingDate(null);
    setEditingRows([]);
    try { window.dispatchEvent(new Event('e2e-localstorage-updated')); } catch {}
  };

  return (
    <main role="main" className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50" data-testid="settings-mounted">
      {renderBody()}
    </main>
  );
}
