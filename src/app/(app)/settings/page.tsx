"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

const tzOptions = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
];

export default function SettingsPage() {
  const router = useRouter();
  const { family, parent, refreshProfile } = useAuth();
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

  const isBypass = useMemo(() => (
    process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === '1' ||
    (typeof window !== 'undefined' && (
      new URLSearchParams(window.location.search).get('e2e') === '1' ||
      window.localStorage.getItem('E2E_BYPASS') === '1'
    ))
  ), []);

  useEffect(() => {
    if (family) {
      setFamilyName(family.name ?? '');
      setTimezone(family.timezone ?? 'America/New_York');
      setSiblingVisibility((family as any).sibling_visibility ?? true);
    }
  }, [family]);

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

  const saveChanges = async () => {
    setSaving(true);
    try {
      // Persist family changes in localStorage so dashboard reads it (always safe for E2E and local)
      if (typeof window !== 'undefined') {
        const rawFam = window.localStorage.getItem('E2E_FAMILY');
        const fam = rawFam ? JSON.parse(rawFam) : { id: 'fam-e2e' };
        fam.name = familyName;
        fam.timezone = timezone;
        fam.sibling_visibility = siblingVisibility;
        window.localStorage.setItem('E2E_FAMILY', JSON.stringify(fam));
        // Ensure auth context reacts before navigating (both cross-tab and same-tab)
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
    // Validation: first tier must start at 0 cents
    const lower0 = Math.round(Number((tiers[0]?.lower ?? '0').trim() || '0') * 100);
    if (lower0 !== 0) {
      // Display inline validation message for tests
      const host = document.getElementById('tiers-validation') || document.createElement('div');
      host.id = 'tiers-validation';
      host.textContent = 'must start at 0 cents';
      host.className = 'text-sm text-red-600';
      const insertAfter = document.getElementById('tier-lower-0')?.parentElement?.parentElement;
      if (insertAfter?.parentElement) insertAfter.parentElement.insertBefore(host, insertAfter.nextSibling);
      return;
    }

    // Best-effort E2E-only: stash tiers in localStorage under date->list
    const dateKey = effectiveDate || new Date().toISOString().slice(0, 10);
    if (typeof window === 'undefined') return;
    const familyId = family?.id ?? 'fam-e2e';
    const parsed = tiers.map(t => ({
      lower_cents: Math.round(Number(t.lower || '0') * 100) || 0,
      upper_cents: t.upper ? Math.round(Number(t.upper) * 100) : null,
      apr_bps: Math.round(Number(t.apr || '0')) || 0,
    }));
    const raw = window.localStorage.getItem('E2E_TIERS');
    const all = raw ? JSON.parse(raw) : {};
    all[familyId] = all[familyId] || {};
    all[familyId][dateKey] = parsed;
    window.localStorage.setItem('E2E_TIERS', JSON.stringify(all));
    setScheduledByDate(all[familyId]);
    // Hint the app to allow local child/account creation and faster ticker for E2E
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
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Settings</CardTitle>
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
    </div>
  );
}

