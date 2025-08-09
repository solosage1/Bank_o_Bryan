"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { track } from '@/components/analytics/track';

type TierDraft = { lower_cents: number; upper_cents: number | null; apr_bps: number };

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
];

export default function SettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, parent, family, loading, refreshProfile } = useAuth();

  const [familyName, setFamilyName] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [siblingVisibility, setSiblingVisibility] = useState(true);
  const [saving, setSaving] = useState(false);

  // Interest tiers state (current and future)
  const [activeTiers, setActiveTiers] = useState<TierDraft[]>([]);
  const [newTierRows, setNewTierRows] = useState<TierDraft[]>([{ lower_cents: 0, upper_cents: null, apr_bps: 200 }]);
  const [effectiveDate, setEffectiveDate] = useState<Date | null>(null);
  const [isLoadingTiers, setIsLoadingTiers] = useState(false);
  const [scheduledSets, setScheduledSets] = useState<{ effective_from: string; rows: (TierDraft & { id: string })[] }[]>([]);
  const [isLoadingScheduled, setIsLoadingScheduled] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editEffectiveFrom, setEditEffectiveFrom] = useState<string | null>(null);
  const [editTierRows, setEditTierRows] = useState<TierDraft[]>([]);
  const [deleteTargetDate, setDeleteTargetDate] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/');
      return;
    }
    if (family) {
      setFamilyName(family.name || '');
      setTimezone(family.timezone || 'America/New_York');
      setSiblingVisibility(Boolean((family as any).sibling_visibility));
      void fetchActiveTiers();
      void fetchScheduledSets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, family]);

  const fetchActiveTiers = async () => {
    if (!family) return;
    try {
      setIsLoadingTiers(true);
      // Fetch all tiers effective up to today, then select latest effective_from and filter
      const { data, error } = await (supabase as any)
        .from('interest_tiers')
        .select('lower_bound_cents, upper_bound_cents, apr_bps, effective_from')
        .eq('family_id', family.id)
        .lte('effective_from', new Date().toISOString().slice(0, 10))
        .order('effective_from', { ascending: false })
        .order('lower_bound_cents', { ascending: true });
      if (error) throw error;
      const rows = (data as any[]) || [];
      if (rows.length === 0) {
        setActiveTiers([]);
        return;
      }
      const latestDate = rows[0].effective_from;
      const currentSet = rows
        .filter(r => r.effective_from === latestDate)
        .map(r => ({ lower_cents: Number(r.lower_bound_cents), upper_cents: r.upper_bound_cents != null ? Number(r.upper_bound_cents) : null, apr_bps: Number(r.apr_bps) }));
      setActiveTiers(currentSet);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch active tiers', err);
      setActiveTiers([]);
    } finally {
      setIsLoadingTiers(false);
    }
  };

  const fetchScheduledSets = async () => {
    if (!family) return;
    try {
      setIsLoadingScheduled(true);
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await (supabase as any)
        .from('interest_tiers')
        .select('id, lower_bound_cents, upper_bound_cents, apr_bps, effective_from')
        .eq('family_id', family.id)
        .gt('effective_from', today)
        .order('effective_from', { ascending: true })
        .order('lower_bound_cents', { ascending: true });
      if (error) throw error;
      const rows = (data as any[]) || [];
      const grouped = new Map<string, (TierDraft & { id: string })[]>();
      for (const r of rows) {
        const k = r.effective_from as string;
        const list = grouped.get(k) ?? [];
        list.push({ id: String(r.id), lower_cents: Number(r.lower_bound_cents), upper_cents: r.upper_bound_cents != null ? Number(r.upper_bound_cents) : null, apr_bps: Number(r.apr_bps) });
        grouped.set(k, list);
      }
      const sets = Array.from(grouped.entries()).map(([effective_from, rows]) => ({ effective_from, rows }));
      setScheduledSets(sets);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch scheduled tier sets', err);
      setScheduledSets([]);
    } finally {
      setIsLoadingScheduled(false);
    }
  };

  const validateTierRows = (rows: TierDraft[]) => {
    if (rows.length === 0) return 'At least one tier is required';
    const sorted = [...rows].sort((a, b) => a.lower_cents - b.lower_cents);
    if (sorted[0].lower_cents !== 0) return 'First tier must start at 0 cents';
    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      if (t.upper_cents != null && t.upper_cents <= t.lower_cents) return 'Upper must be greater than lower or null';
      if (i < sorted.length - 1) {
        const next = sorted[i + 1];
        if (t.upper_cents == null) return 'Only last tier may have no upper bound';
        if (t.upper_cents !== next.lower_cents) return 'Tiers must be contiguous without gaps/overlaps';
      }
    }
    return null;
  };

  const saveFamily = async () => {
    if (!family) return;
    if (!familyName.trim()) return;
    try {
      setSaving(true);
      const prevName = family.name;
      const prevTz = family.timezone;
      const prevSV = Boolean((family as any).sibling_visibility);
      const isBypass = process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === '1' || (typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('e2e') === '1' || window.localStorage.getItem('E2E_BYPASS') === '1'));
      if (isBypass) {
        // Persist to localStorage and refresh profile instead of hitting backend
        if (typeof window !== 'undefined') {
          const stored = window.localStorage.getItem('E2E_FAMILY');
          const current = stored ? JSON.parse(stored) : { id: 'fam-e2e' };
          const updated = { ...current, name: familyName.trim(), timezone, sibling_visibility: siblingVisibility };
          window.localStorage.setItem('E2E_FAMILY', JSON.stringify(updated));
        }
        await refreshProfile();
      } else {
        const { error } = await supabase
          .from('families')
          .update({ name: familyName.trim(), timezone, sibling_visibility: siblingVisibility })
          .eq('id', family.id);
        if (error) throw error;
        await refreshProfile();
      }
      // Telemetry
      const changed = {
        name: prevName !== familyName.trim(),
        timezone: prevTz !== timezone,
        sibling_visibility: prevSV !== siblingVisibility,
      };
      track('settings_family_updated', { changed });
      if (changed.timezone) track('settings_timezone_updated', { from: prevTz, to: timezone });
      if (changed.sibling_visibility) track('settings_sibling_visibility_updated', { from: prevSV, to: siblingVisibility });
      // Audit (best-effort)
      (async () => {
        try {
          await supabase.rpc('log_audit_event', {
            p_family_id: family.id,
            p_user_type: 'parent',
            p_user_id: parent?.id ?? (user as any)?.id ?? '',
            p_action: 'Updated family settings',
            p_entity_type: 'family',
            p_entity_id: family.id,
            p_metadata: {
              before: { name: prevName, timezone: prevTz, sibling_visibility: prevSV },
              after: { name: familyName.trim(), timezone, sibling_visibility: siblingVisibility }
            }
          });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('Audit log failed (non-blocking):', e);
        }
      })();
      toast({ title: 'Saved', description: 'Family settings updated successfully' });
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(err);
      toast({ title: 'Failed to save', description: String(err?.message || err), variant: 'destructive' as any });
    } finally {
      setSaving(false);
    }
  };

  const addTierRow = () => {
    const last = newTierRows[newTierRows.length - 1];
    const nextLower = last.upper_cents != null ? last.upper_cents : last.lower_cents + 10000;
    setNewTierRows((r) => [...r, { lower_cents: nextLower, upper_cents: null, apr_bps: 200 }]);
  };

  const updateTierRow = (idx: number, patch: Partial<TierDraft>) => {
    setNewTierRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const deleteTierRow = (idx: number) => {
    setNewTierRows((rows) => rows.filter((_, i) => i !== idx));
  };

  const saveNewTiers = async () => {
    if (!family) return;
    if (!effectiveDate) {
      toast({ title: 'Select effective date', description: 'Choose when these tiers should take effect', variant: 'destructive' as any });
      return;
    }
    const errMsg = validateTierRows(newTierRows);
    if (errMsg) {
      toast({ title: 'Invalid tiers', description: errMsg, variant: 'destructive' as any });
      return;
    }
    try {
      const rows = newTierRows.map((t) => ({
        family_id: family.id,
        child_id: null,
        lower_bound_cents: t.lower_cents,
        upper_bound_cents: t.upper_cents,
        apr_bps: t.apr_bps,
        effective_from: effectiveDate.toISOString().slice(0, 10),
      }));
      const { error } = await (supabase as any)
        .from('interest_tiers')
        .insert(rows);
      if (error) throw error;
      // Telemetry
      track('tiers_created', { effective_from: rows[0]?.effective_from, tiers: newTierRows });
      // Audit (best-effort)
      (async () => {
        try {
          await supabase.rpc('log_audit_event', {
            p_family_id: family.id,
            p_user_type: 'parent',
            p_user_id: parent?.id ?? (user as any)?.id ?? '',
            p_action: 'Scheduled new interest tiers',
            p_entity_type: 'interest_tiers',
            p_entity_id: undefined,
            p_metadata: { effective_from: rows[0]?.effective_from, tiers: rows }
          });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('Audit log failed (non-blocking):', e);
        }
      })();
      toast({ title: 'Tiers scheduled', description: 'New interest tiers have been saved' });
      setNewTierRows([{ lower_cents: 0, upper_cents: null, apr_bps: 200 }]);
      setEffectiveDate(null);
      await fetchActiveTiers();
      await fetchScheduledSets();
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('Failed to save tiers', err);
      toast({ title: 'Failed to save tiers', description: String(err?.message || err), variant: 'destructive' as any });
    }
  };

  const openEditSet = (effective_from: string) => {
    const found = scheduledSets.find(s => s.effective_from === effective_from);
    if (!found) return;
    setEditEffectiveFrom(effective_from);
    setEditTierRows(found.rows.map(r => ({ lower_cents: r.lower_cents, upper_cents: r.upper_cents, apr_bps: r.apr_bps })));
    setEditOpen(true);
  };

  const updateEditRow = (idx: number, patch: Partial<TierDraft>) => {
    setEditTierRows(rows => rows.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const addEditRow = () => {
    const last = editTierRows[editTierRows.length - 1] ?? { lower_cents: 0, upper_cents: null, apr_bps: 200 };
    const nextLower = last.upper_cents != null ? last.upper_cents : last.lower_cents + 10000;
    setEditTierRows(r => [...r, { lower_cents: nextLower, upper_cents: null, apr_bps: 200 }]);
  };

  const removeEditRow = (idx: number) => setEditTierRows(r => r.filter((_, i) => i !== idx));

  const saveEditedSet = async () => {
    if (!family || !editEffectiveFrom) return;
    const errMsg = validateTierRows(editTierRows);
    if (errMsg) {
      toast({ title: 'Invalid tiers', description: errMsg, variant: 'destructive' as any });
      return;
    }
    const before = scheduledSets.find(s => s.effective_from === editEffectiveFrom)?.rows ?? [];
    try {
      const rowsPayload = editTierRows.map(t => ({ lower_bound_cents: t.lower_cents, upper_bound_cents: t.upper_cents, apr_bps: t.apr_bps }));
      const { error: rpcErr } = await supabase.rpc('replace_interest_tier_set', {
        p_family_id: family.id,
        p_effective_from: editEffectiveFrom,
        p_rows: rowsPayload as any
      } as any);
      if (rpcErr) throw rpcErr;
      track('tiers_updated', { effective_from: editEffectiveFrom, tiers_before: before, tiers_after: editTierRows });
      (async () => {
        try {
          await supabase.rpc('log_audit_event', {
            p_family_id: family.id,
            p_user_type: 'parent',
            p_user_id: parent?.id ?? (user as any)?.id ?? '',
            p_action: 'Updated scheduled interest tiers',
            p_entity_type: 'interest_tiers',
            p_entity_id: undefined,
            p_metadata: { effective_from: editEffectiveFrom, before, after: editTierRows }
          });
        } catch (e) { console.warn('Audit log failed (non-blocking):', e); }
      })();
      toast({ title: 'Tiers updated', description: `Scheduled tiers for ${editEffectiveFrom} saved` });
      setEditOpen(false);
      await fetchScheduledSets();
    } catch (e: any) {
      console.error('Failed to update tiers', e);
      toast({ title: 'Failed to update tiers', description: String(e?.message || e), variant: 'destructive' as any });
    }
  };

  const deleteScheduledSet = async (effective_from: string) => {
    if (!family) return;
    try {
      const before = scheduledSets.find(s => s.effective_from === effective_from)?.rows ?? [];
      const { error } = await supabase.rpc('delete_interest_tier_set', {
        p_family_id: family.id,
        p_effective_from: effective_from
      } as any);
      if (error) throw error;
      track('tiers_deleted', { effective_from, count: before.length });
      (async () => {
        try {
          await supabase.rpc('log_audit_event', {
            p_family_id: family.id,
            p_user_type: 'parent',
            p_user_id: parent?.id ?? (user as any)?.id ?? '',
            p_action: 'Deleted scheduled interest tiers',
            p_entity_type: 'interest_tiers',
            p_entity_id: undefined,
            p_metadata: { effective_from, deleted: before }
          });
        } catch (e) { console.warn('Audit log failed (non-blocking):', e); }
      })();
      toast({ title: 'Tiers deleted', description: `Removed scheduled tiers for ${effective_from}` });
      setDeleteTargetDate(null);
      await fetchScheduledSets();
    } catch (e: any) {
      console.error('Failed to delete scheduled tiers', e);
      toast({ title: 'Failed to delete tiers', description: String(e?.message || e), variant: 'destructive' as any });
    }
  };

  const effectiveDateLabel = useMemo(() => (effectiveDate ? effectiveDate.toDateString() : 'Pick a date'), [effectiveDate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
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
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select your timezone" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="siblingVisibility">Sibling Visibility</Label>
              <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                <div>
                  <p className="text-gray-900 font-medium">Allow siblings to view each other’s balances</p>
                  <p className="text-sm text-gray-500">You can change this later.</p>
                </div>
                <Switch id="siblingVisibility" checked={siblingVisibility} onCheckedChange={setSiblingVisibility} />
              </div>
            </div>
            <div className="pt-2">
              <Button onClick={saveFamily} disabled={saving || !familyName.trim()}>Save Changes</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle>Interest Tiers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Current Active Tiers</h3>
              {isLoadingTiers ? (
                <p className="text-gray-500 text-sm">Loading tiers…</p>
              ) : activeTiers.length === 0 ? (
                <p className="text-gray-500 text-sm">No active tiers configured.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {activeTiers.map((t, i) => (
                    <div key={i} className="rounded-md border p-3 text-sm text-gray-700">
                      <div>
                        <span className="text-gray-500">Range:</span>{' '}
                        {`$${(t.lower_cents / 100).toFixed(2)}`} – {t.upper_cents != null ? `$${(t.upper_cents / 100).toFixed(2)}` : '∞'}
                      </div>
                      <div><span className="text-gray-500">APR:</span> {(t.apr_bps/100).toFixed(2)}%</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-700">Schedule New Tiers</h3>
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-[220px] justify-start', !effectiveDate && 'text-muted-foreground')}>
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {effectiveDateLabel}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={effectiveDate ?? undefined}
                      onSelect={(d) => setEffectiveDate(d ?? null)}
                      disabled={(date) => date < new Date(new Date().toDateString())}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <span className="text-xs text-gray-500">Effective date (&gt;= today)</span>
              </div>

              <div className="space-y-2">
                {newTierRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    <div className="md:col-span-3">
                      <Label className="text-xs">Lower ($)</Label>
                      <Input type="number" step="0.01" value={(row.lower_cents/100).toFixed(2)} onChange={(e) => updateTierRow(idx, { lower_cents: Math.round(Number(e.target.value || 0) * 100) })} />
                    </div>
                    <div className="md:col-span-3">
                      <Label className="text-xs">Upper ($, blank = ∞)</Label>
                      <Input type="number" step="0.01" value={row.upper_cents != null ? (row.upper_cents/100).toFixed(2) : ''} onChange={(e) => {
                        const v = e.target.value;
                        updateTierRow(idx, { upper_cents: v === '' ? null : Math.round(Number(v) * 100) });
                      }} />
                    </div>
                    <div className="md:col-span-3">
                      <Label className="text-xs">APR (bps)</Label>
                      <Input type="number" step="1" value={row.apr_bps} onChange={(e) => updateTierRow(idx, { apr_bps: Number(e.target.value || 0) })} />
                    </div>
                    <div className="md:col-span-3 flex items-end gap-2">
                      <Button type="button" variant="outline" onClick={() => deleteTierRow(idx)} disabled={newTierRows.length === 1}>Remove</Button>
                    </div>
                  </div>
                ))}
                <div className="pt-1 flex gap-2">
                  <Button type="button" variant="outline" onClick={addTierRow}>Add Tier</Button>
                  <Button type="button" onClick={saveNewTiers}>Save Scheduled Tiers</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scheduled Sets */}
        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle>Scheduled Tier Sets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4" data-testid="tiers-scheduled-list">
            {isLoadingScheduled ? (
              <p className="text-gray-500 text-sm">Loading scheduled sets…</p>
            ) : scheduledSets.length === 0 ? (
              <p className="text-gray-500 text-sm">No future tier sets scheduled.</p>
            ) : (
              <div className="space-y-3">
                {scheduledSets.map((set) => (
                  <div key={set.effective_from} className="rounded-md border p-3" data-testid={`tier-set-${set.effective_from}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium">Effective {set.effective_from}</div>
                      <div className="space-x-2">
                        <Button size="sm" variant="outline" data-testid={`tier-set-edit-${set.effective_from}`} onClick={() => openEditSet(set.effective_from)}>Edit</Button>
                        <Button size="sm" variant="outline" data-testid={`tier-set-delete-${set.effective_from}`} onClick={() => setDeleteTargetDate(set.effective_from)}>Delete</Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-gray-700">
                      {set.rows.map((t, i) => (
                        <div key={i} className="rounded border p-2">
                          <div><span className="text-gray-500">Range:</span> {`$${(t.lower_cents/100).toFixed(2)}`} – {t.upper_cents != null ? `$${(t.upper_cents/100).toFixed(2)}` : '∞'}</div>
                          <div><span className="text-gray-500">APR:</span> {(t.apr_bps/100).toFixed(2)}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Scheduled Tiers {editEffectiveFrom ? `(${editEffectiveFrom})` : ''}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {editTierRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-2">
                  <div className="md:col-span-3">
                    <Label className="text-xs">Lower ($)</Label>
                    <Input data-testid={`edit-tier-lower-${idx}`} type="number" step="0.01" value={(row.lower_cents/100).toFixed(2)} onChange={(e) => updateEditRow(idx, { lower_cents: Math.round(Number(e.target.value || 0) * 100) })} />
                  </div>
                  <div className="md:col-span-3">
                    <Label className="text-xs">Upper ($, blank = ∞)</Label>
                    <Input data-testid={`edit-tier-upper-${idx}`} type="number" step="0.01" value={row.upper_cents != null ? (row.upper_cents/100).toFixed(2) : ''} onChange={(e) => updateEditRow(idx, { upper_cents: e.target.value === '' ? null : Math.round(Number(e.target.value) * 100) })} />
                  </div>
                  <div className="md:col-span-3">
                    <Label className="text-xs">APR (bps)</Label>
                    <Input data-testid={`edit-tier-apr-${idx}`} type="number" step="1" value={row.apr_bps} onChange={(e) => updateEditRow(idx, { apr_bps: Number(e.target.value || 0) })} />
                  </div>
                  <div className="md:col-span-3 flex items-end gap-2">
                    <Button type="button" variant="outline" data-testid={`edit-tier-remove-${idx}`} onClick={() => removeEditRow(idx)} disabled={editTierRows.length === 1}>Remove</Button>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <Button type="button" variant="outline" data-testid="edit-tier-add" onClick={addEditRow}>Add Row</Button>
                <Button type="button" data-testid="edit-tier-save" onClick={saveEditedSet}>Save</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm Dialog (simple inline) */}
        {deleteTargetDate && (
          <Dialog open={true} onOpenChange={(o) => { if (!o) setDeleteTargetDate(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete scheduled tiers for {deleteTargetDate}?</DialogTitle>
              </DialogHeader>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setDeleteTargetDate(null)}>Cancel</Button>
                <Button data-testid="tier-set-confirm-delete" onClick={() => deleteScheduledSet(deleteTargetDate)}>Delete</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}

