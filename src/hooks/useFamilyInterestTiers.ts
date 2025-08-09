"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type FamilyTier = { lower_cents: number; upper_cents: number | null; apr_bps: number };

export function useFamilyInterestTiers(familyId?: string | null) {
  const [tiers, setTiers] = useState<FamilyTier[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!familyId) {
      setTiers(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const today = new Date().toISOString().slice(0, 10);
        const { data, error } = await (supabase as any)
          .from('interest_tiers')
          .select('lower_bound_cents, upper_bound_cents, apr_bps, effective_from')
          .eq('family_id', familyId)
          .lte('effective_from', today)
          .order('effective_from', { ascending: false })
          .order('lower_bound_cents', { ascending: true });
        if (error) throw error;
        const rows = (data as any[]) || [];
        if (rows.length === 0) {
          if (!cancelled) setTiers([]);
          return;
        }
        const latestDate = rows[0].effective_from;
        const current = rows
          .filter(r => r.effective_from === latestDate)
          .map(r => ({
            lower_cents: Number(r.lower_bound_cents),
            upper_cents: r.upper_bound_cents != null ? Number(r.upper_bound_cents) : null,
            apr_bps: Number(r.apr_bps)
          }));
        if (!cancelled) setTiers(current);
      } catch (err: any) {
        if (!cancelled) setError(String(err?.message || err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  return { tiers, loading, error };
}


