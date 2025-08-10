"use client";

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { isE2EEnabled, loadCurrentTiers } from '@/lib/e2e';
import { supabaseQueryFn } from '@/lib/fetching';

export type FamilyTier = { lower_cents: number; upper_cents: number | null; apr_bps: number };

export function useFamilyInterestTiers(familyId?: string | null) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const isBypass = isE2EEnabled();
  const query = useQuery({
    queryKey: ['tiers', familyId, today],
    enabled: Boolean(familyId),
    queryFn: () =>
      supabaseQueryFn(['tiers', familyId, today], async (signal) => {
        if (!familyId) return [] as FamilyTier[];
        if (isBypass) return loadCurrentTiers(familyId, today) as FamilyTier[];
        const { data, error } = await (supabase as any)
          .from('interest_tiers')
          .select('lower_bound_cents, upper_bound_cents, apr_bps, effective_from')
          .eq('family_id', familyId)
          .lte('effective_from', today)
          .order('effective_from', { ascending: false })
          .order('lower_bound_cents', { ascending: true })
          .abortSignal(signal);
        if (error) throw error;
        const rows = (data as any[]) || [];
        if (rows.length === 0) return [] as FamilyTier[];
        const latestDate = rows[0].effective_from;
        const current = rows
          .filter((r) => r.effective_from === latestDate)
          .map((r) => ({
            lower_cents: Number(r.lower_bound_cents),
            upper_cents: r.upper_bound_cents != null ? Number(r.upper_bound_cents) : null,
            apr_bps: Number(r.apr_bps),
          }));
        return current as FamilyTier[];
      }),
  });

  return { tiers: (query.data as FamilyTier[] | undefined) ?? null, loading: query.isLoading, error: query.error ? String(query.error) : null };
}


