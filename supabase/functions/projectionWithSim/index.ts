import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

interface ProjectionPoint {
  month: number;
  balance: number;
  interestEarned: number;
  totalInterest: number;
  date: string;
}

interface SimulationParams {
  monthlyDeposit?: number;
  monthlyWithdrawal?: number;
  oneTimeDeposit?: number;
  oneTimeDepositMonth?: number;
  oneTimeWithdrawal?: number;
  oneTimeWithdrawalMonth?: number;
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
      .select('id, balance, child_id')
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
      .select('min_balance, max_balance, annual_rate')
      .eq('is_active', true)
      .order('min_balance', { ascending: true });

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

    // Generate baseline projection (without simulation)
    function generateProjection(startingBalance: number, sim: SimulationParams = {}): ProjectionPoint[] {
      const projections: ProjectionPoint[] = [];
      let currentBalance = startingBalance;
      let totalInterestEarned = 0;
      const startDate = new Date();

      for (let month = 0; month <= 12; month++) {
        const projectionDate = new Date(startDate);
        projectionDate.setMonth(startDate.getMonth() + month);

        if (month === 0) {
          // Current state
          projections.push({
            month,
            balance: currentBalance,
            interestEarned: 0,
            totalInterest: totalInterestEarned,
            date: projectionDate.toISOString().split('T')[0]
          });
        } else {
          // Apply monthly deposits/withdrawals
          if (sim.monthlyDeposit) {
            currentBalance += sim.monthlyDeposit;
          }
          if (sim.monthlyWithdrawal) {
            currentBalance = Math.max(0, currentBalance - sim.monthlyWithdrawal);
          }

          // Apply one-time transactions
          if (sim.oneTimeDeposit && sim.oneTimeDepositMonth === month) {
            currentBalance += sim.oneTimeDeposit;
          }
          if (sim.oneTimeWithdrawal && sim.oneTimeWithdrawalMonth === month) {
            currentBalance = Math.max(0, currentBalance - sim.oneTimeWithdrawal);
          }

          // Calculate interest for this month
          const annualRate = getInterestRate(currentBalance);
          const monthlyRate = annualRate / 12;
          const monthlyInterest = currentBalance * monthlyRate;
          
          currentBalance += monthlyInterest;
          totalInterestEarned += monthlyInterest;

          projections.push({
            month,
            balance: Math.round(currentBalance * 100) / 100,
            interestEarned: Math.round(monthlyInterest * 100) / 100,
            totalInterest: Math.round(totalInterestEarned * 100) / 100,
            date: projectionDate.toISOString().split('T')[0]
          });
        }
      }

      return projections;
    }

    // Generate baseline projection
    const baselineProjections = generateProjection(account.balance);

    // Generate simulation projection if parameters provided
    let simulationProjections = null;
    if (simulation) {
      simulationProjections = generateProjection(account.balance, simulation);
    }

    const result = {
      account_id,
      starting_balance: account.balance,
      baseline: baselineProjections,
      simulation: simulationProjections,
      simulation_params: simulation || null,
      interest_tiers: tiers,
      generated_at: new Date().toISOString()
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