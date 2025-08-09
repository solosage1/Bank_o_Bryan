import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

interface AccountRow {
  id: string;
  child_id: string;
  current_balance_cents: number;
  as_of: string; // last authoritative timestamp
}

interface InterestRun {
  run_date: string;
  accounts_processed: number;
  total_interest_paid: number;
}

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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // today in UTC (date-only)
    const today = new Date().toISOString().slice(0, 10);

    // Get all accounts
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, child_id, current_balance_cents, as_of');

    if (accountsError) {
      throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
    }

    let accountsProcessed = 0;

    // Process each account
    for (const account of (accounts as AccountRow[]) || []) {
      try {
        // Compute days to run from last as_of to today-1
        const lastAsOf = new Date(account.as_of.slice(0, 10));
        const endDate = new Date(today);
        let principal = account.current_balance_cents;
        let carryMicros = 0;

        for (
          let d = new Date(lastAsOf.getTime() + 24 * 3600 * 1000);
          d < endDate;
          d = new Date(d.getTime() + 24 * 3600 * 1000)
        ) {
          const runDate = d.toISOString().slice(0, 10);
          // idempotency: check if already posted for this day
          const { data: existing, error: existingErr } = await supabase
            .from('interest_runs_prd')
            .select('id')
            .eq('account_id', account.id)
            .eq('run_date', runDate)
            .maybeSingle();
          if (existingErr) continue;
          if (existing) continue;

          // fetch tiers for this date
          const { data: tiers } = await supabase
            .from('interest_tiers')
            .select('lower_bound_cents, upper_bound_cents, apr_bps, effective_from, effective_to')
            .lte('effective_from', runDate)
            .or(`effective_to.is.null,effective_to.gte.${runDate}`)
            .order('lower_bound_cents', { ascending: true });

          const slices = (tiers || []).map(t => ({
            lower_cents: t.lower_bound_cents as number,
            upper_cents: (t.upper_bound_cents as number | null) ?? undefined,
            apr_bps: t.apr_bps as number,
          }));

          // daily interest micros on principal at start of day
          let dailyMicros = 0;
          for (const s of slices) {
            const upper = s.upper_cents ?? Number.MAX_SAFE_INTEGER;
            const inTier = Math.max(0, Math.min(principal, upper) - s.lower_cents);
            if (inTier > 0) dailyMicros += Math.round(inTier * (s.apr_bps / 10000 / 365) * 1_000_000);
          }
          const totalMicros = dailyMicros + carryMicros;
          const cents = Math.trunc(totalMicros / 1_000_000);
          carryMicros = totalMicros - cents * 1_000_000;

          if (cents !== 0) {
            // post interest transaction and upsert run
            const { error: txnErr } = await supabase.rpc('process_transaction', {
              p_account_id: account.id,
              p_type: 'interest_posting',
              p_amount_cents: cents,
              p_description: `Daily interest ${runDate}`,
              p_parent_id: null,
              p_transaction_date: runDate,
              p_require_confirm: false,
            });
            if (txnErr) {
              console.error('txn error', txnErr);
              continue;
            }
            principal += cents;
          }

          await supabase.from('interest_runs_prd').insert({
            account_id: account.id,
            run_date: runDate,
            interest_cents: cents,
            residual_micros: carryMicros,
          });
        }

        accountsProcessed++;

      } catch (accountError) {
        console.error(`Error processing account ${account.id}:`, accountError);
      }
    }

    const result = {
      success: true,
      run_date: today,
      accounts_processed: accountsProcessed
    };

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
    console.error('Interest accrual error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to accrue interest'
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