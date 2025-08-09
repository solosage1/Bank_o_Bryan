import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

interface Point { date: string; balance_cents: number }

type WhatIf = { type: 'deposit'|'withdrawal'; amount_cents: number; date: string } | null;

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    let requestData;
    
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const accountId = url.searchParams.get('account_id');
      requestData = { account_id: accountId };
    } else {
      requestData = await req.json();
    }

    const { account_id, simulation } = requestData;

    if (!account_id) {
      return new Response(
        JSON.stringify({ error: 'Missing account_id parameter' }),
        {
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        }
      );
    }

    // Verify access to account through RLS
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, current_balance_cents, child_id, as_of')
      .eq('id', account_id)
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ error: 'Account not found or access denied' }),
        {
          status: 404,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        }
      );
    }

    // Get active interest tiers
    const { data: tiers, error: tiersError } = await supabase
      .from('interest_tiers')
      .select('lower_bound_cents, upper_bound_cents, apr_bps, effective_from, effective_to')
      .order('lower_bound_cents', { ascending: true });

    if (tiersError) {
      throw new Error(`Failed to fetch interest tiers: ${tiersError.message}`);
    }

    // Function to calculate interest rate for a given balance
    function getInterestRate(balance: number): number {
      for (let i = tiers.length - 1; i >= 0; i--) {
        const tier = tiers[i];
        if (balance >= tier.min_balance && 
            (tier.max_balance === null || balance <= tier.max_balance)) {
          return tier.annual_rate;
        }
      }
      return 0; // No tier found
    }

    const startDate = new Date();
    const horizonDays = 365;

    const computeSeries = (whatIf: WhatIf): Point[] => {
      let principal = account.current_balance_cents as number;
      let carryMicros = 0;
      const series: Point[] = [];
      for (let i = 0; i <= horizonDays; i++) {
        const d = new Date(startDate.getTime() + i * 24 * 3600 * 1000);
        const dateStr = d.toISOString().slice(0, 10);
        if (i === 0 && whatIf && whatIf.date === dateStr) {
          if (whatIf.type === 'deposit') principal += whatIf.amount_cents;
          if (whatIf.type === 'withdrawal') principal = Math.max(0, principal - whatIf.amount_cents);
        }
        const active = (tiers || []).filter(t =>
          t.effective_from <= dateStr && (!t.effective_to || t.effective_to >= dateStr)
        ).map(t => ({
          lower_cents: t.lower_bound_cents as number,
          upper_cents: (t.upper_bound_cents as number | null) ?? undefined,
          apr_bps: t.apr_bps as number,
        }));
        let dailyMicros = 0;
        for (const s of active) {
          const upper = s.upper_cents ?? Number.MAX_SAFE_INTEGER;
          const inTier = Math.max(0, Math.min(principal, upper) - s.lower_cents);
          if (inTier > 0) dailyMicros += Math.round(inTier * (s.apr_bps / 10000 / 365) * 1_000_000);
        }
        const totalMicros = dailyMicros + carryMicros;
        const cents = Math.trunc(totalMicros / 1_000_000);
        carryMicros = totalMicros - cents * 1_000_000;
        if (i > 0 && cents !== 0) principal += cents;
        series.push({ date: dateStr, balance_cents: principal });
      }
      return series;
    };

    const baseline = computeSeries(null);
    const what_if: WhatIf = simulation?.what_if ?? null;
    const simulated = what_if ? computeSeries(what_if) : null;
    const pickBalance = (arr: Point[], days: number) => arr[Math.min(days, arr.length - 1)]?.balance_cents ?? 0;
    const deltas = simulated
      ? {
          d30: (pickBalance(simulated, 30) - pickBalance(baseline, 30)),
          d90: (pickBalance(simulated, 90) - pickBalance(baseline, 90)),
          d365: (pickBalance(simulated, 365) - pickBalance(baseline, 365))
        }
      : null;

    const result = { account_id, baseline, simulated, deltas, generated_at: new Date().toISOString() };

    return new Response(
      JSON.stringify(result),
      {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      }
    );

  } catch (error) {
    console.error('Projection with simulation error:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to calculate projections with simulation'
      }),
      {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      }
    );
  }
});