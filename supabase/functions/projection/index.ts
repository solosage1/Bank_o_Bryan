import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

interface Point { date: string; balance_cents: number }

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

    // Get request parameters
    const url = new URL(req.url);
    const accountId = url.searchParams.get('account_id');

    if (!accountId) {
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
      .eq('id', accountId)
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
      .from('interest_tiers_prd')
      .select('lower_bound_cents, upper_bound_cents, apr_bps, effective_from, effective_to')
      .order('lower_bound_cents', { ascending: true });

    if (tiersError) {
      throw new Error(`Failed to fetch interest tiers: ${tiersError.message}`);
    }

    const startDate = new Date();
    const horizonDays = 365;
    const points: Point[] = [];
    let principal = account.current_balance_cents as number;
    let carryMicros = 0;
    for (let i = 0; i <= horizonDays; i++) {
      const d = new Date(startDate.getTime() + i * 24 * 3600 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
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
      points.push({ date: dateStr, balance_cents: principal });
    }

    const result = { account_id: accountId, baseline: points, generated_at: new Date().toISOString() };

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
    console.error('Projection calculation error:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to calculate projections'
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