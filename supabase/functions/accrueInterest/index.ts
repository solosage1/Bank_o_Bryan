import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

interface Account {
  id: string;
  child_id: string;
  balance: number;
  last_interest_date: string;
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

    // Get current date in UTC
    const today = new Date().toISOString().split('T')[0];

    // Check if interest has already been accrued today
    const { data: existingRun } = await supabase
      .from('interest_runs')
      .select('id')
      .eq('run_date', today)
      .eq('status', 'completed')
      .single();

    if (existingRun) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Interest already accrued for today',
          run_date: today 
        }),
        {
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        }
      );
    }

    // Create new interest run
    const { data: interestRun, error: runError } = await supabase
      .from('interest_runs')
      .insert([{
        run_date: today,
        status: 'running'
      }])
      .select()
      .single();

    if (runError) {
      throw new Error(`Failed to create interest run: ${runError.message}`);
    }

    // Get all accounts that need interest accrual
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, child_id, balance, last_interest_date')
      .neq('balance', 0)
      .lt('last_interest_date', today);

    if (accountsError) {
      throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
    }

    let totalInterestPaid = 0;
    let accountsProcessed = 0;

    // Process each account
    for (const account of accounts || []) {
      try {
        // Calculate days since last interest
        const lastInterestDate = new Date(account.last_interest_date);
        const currentDate = new Date(today);
        const daysDiff = Math.floor(
          (currentDate.getTime() - lastInterestDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysDiff <= 0) continue;

        // Calculate interest using the database function
        const { data: interestData, error: interestError } = await supabase
          .rpc('calculate_daily_interest', {
            account_balance: account.balance,
            account_id: account.id
          });

        if (interestError) {
          console.error(`Failed to calculate interest for account ${account.id}:`, interestError);
          continue;
        }

        const dailyInterest = parseFloat(interestData || '0');
        const totalInterest = dailyInterest * daysDiff;

        if (totalInterest > 0) {
          // Process interest transaction
          const { error: transactionError } = await supabase
            .rpc('process_transaction', {
              p_account_id: account.id,
              p_type: 'interest',
              p_amount: totalInterest,
              p_description: `Interest accrued for ${daysDiff} day(s)`,
              p_transaction_date: today
            });

          if (transactionError) {
            console.error(`Failed to process interest for account ${account.id}:`, transactionError);
            continue;
          }

          // Update account's last interest date and total earned
          const { error: updateError } = await supabase
            .from('accounts')
            .update({
              last_interest_date: today,
              total_earned: account.balance + totalInterest - account.balance // This will be recalculated by trigger
            })
            .eq('id', account.id);

          if (updateError) {
            console.error(`Failed to update account ${account.id}:`, updateError);
            continue;
          }

          totalInterestPaid += totalInterest;
        }

        accountsProcessed++;

      } catch (accountError) {
        console.error(`Error processing account ${account.id}:`, accountError);
      }
    }

    // Update interest run with results
    const { error: updateRunError } = await supabase
      .from('interest_runs')
      .update({
        accounts_processed: accountsProcessed,
        total_interest_paid: totalInterestPaid,
        completed_at: new Date().toISOString(),
        status: 'completed'
      })
      .eq('id', interestRun.id);

    if (updateRunError) {
      throw new Error(`Failed to update interest run: ${updateRunError.message}`);
    }

    const result = {
      success: true,
      run_date: today,
      accounts_processed: accountsProcessed,
      total_interest_paid: totalInterestPaid,
      run_id: interestRun.id
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