/*
  # Bank o'Bryan Financial System

  1. New Tables
    - `interest_tiers` - Configurable interest rate tiers based on balance ranges
      - `id` (uuid, primary key)
      - `min_balance` (decimal) - Minimum balance for tier
      - `max_balance` (decimal) - Maximum balance for tier (null for unlimited)
      - `annual_rate` (decimal) - Annual interest rate percentage
      - `is_active` (boolean) - Whether tier is currently active

    - `transactions` - All financial transactions (deposits, withdrawals, interest)
      - `id` (uuid, primary key)
      - `account_id` (uuid, foreign key to accounts)
      - `type` (enum) - 'deposit', 'withdrawal', 'interest'
      - `amount` (decimal) - Transaction amount
      - `description` (text) - Transaction description
      - `parent_id` (uuid) - Which parent made the transaction
      - `transaction_date` (date) - When transaction occurred
      - `created_at` (timestamp)

    - `interest_runs` - Tracking of daily interest calculation jobs
      - `id` (uuid, primary key)
      - `run_date` (date) - Date interest was calculated for
      - `accounts_processed` (integer) - Number of accounts processed
      - `total_interest_paid` (decimal) - Total interest distributed
      - `completed_at` (timestamp)

  2. Security
    - Enable RLS on all tables with family-scoped access
    - Create policies for safe transaction management

  3. Functions
    - Interest calculation function using tiered rates
    - Balance update functions with atomic operations
*/

DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM ('deposit', 'withdrawal', 'interest');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Create financial tables
CREATE TABLE IF NOT EXISTS interest_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  min_balance decimal(12,2) NOT NULL DEFAULT 0.00,
  max_balance decimal(12,2),
  annual_rate decimal(5,4) NOT NULL CHECK (annual_rate >= 0 AND annual_rate <= 1),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT check_balance_range CHECK (
    max_balance IS NULL OR max_balance > min_balance
  )
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
  type transaction_type NOT NULL,
  amount decimal(12,2) NOT NULL CHECK (amount > 0),
  balance_after decimal(12,2) NOT NULL CHECK (balance_after >= 0),
  description text NOT NULL,
  parent_id uuid REFERENCES parents(id),
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL UNIQUE,
  accounts_processed integer DEFAULT 0,
  total_interest_paid decimal(12,2) DEFAULT 0.00,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  status text DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_interest_tiers_active ON interest_tiers(is_active, min_balance);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_interest_runs_date ON interest_runs(run_date DESC);

-- Enable Row Level Security
ALTER TABLE interest_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interest_runs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for interest_tiers (readable by all authenticated users)
CREATE POLICY "Anyone can read active interest tiers"
  ON interest_tiers
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- RLS Policies for transactions
CREATE POLICY "Parents can view transactions for their family children"
  ON transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM accounts a
      JOIN children c ON c.id = a.child_id
      JOIN parents p ON p.family_id = c.family_id
      WHERE a.id = transactions.account_id 
      AND p.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Parents can create transactions for their family children"
  ON transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts a
      JOIN children c ON c.id = a.child_id
      JOIN parents p ON p.family_id = c.family_id
      WHERE a.id = transactions.account_id 
      AND p.auth_user_id = auth.uid()
    )
  );

-- RLS Policies for interest_runs (readable by all authenticated users for transparency)
CREATE POLICY "Anyone can read interest run history"
  ON interest_runs
  FOR SELECT
  TO authenticated
  USING (true);

-- Insert default interest tiers
INSERT INTO interest_tiers (min_balance, max_balance, annual_rate) VALUES
  (0.00, 99.99, 0.0100),      -- 1% for $0-99.99
  (100.00, 499.99, 0.0150),   -- 1.5% for $100-499.99
  (500.00, 999.99, 0.0200),   -- 2% for $500-999.99
  (1000.00, 4999.99, 0.0250), -- 2.5% for $1000-4999.99
  (5000.00, NULL, 0.0300);     -- 3% for $5000+

-- Function to calculate daily interest for an account
CREATE OR REPLACE FUNCTION calculate_daily_interest(account_balance decimal, account_id uuid)
RETURNS decimal AS $$
DECLARE
  tier_rate decimal := 0;
  daily_rate decimal;
  daily_interest decimal;
BEGIN
  -- Find the appropriate interest tier
  SELECT annual_rate INTO tier_rate
  FROM interest_tiers
  WHERE is_active = true
    AND account_balance >= min_balance
    AND (max_balance IS NULL OR account_balance <= max_balance)
  ORDER BY min_balance DESC
  LIMIT 1;

  -- Calculate daily interest (annual rate / 365)
  daily_rate := tier_rate / 365.0;
  daily_interest := account_balance * daily_rate;
  
  -- Round to 2 decimal places
  RETURN ROUND(daily_interest, 2);
END;
$$ LANGUAGE plpgsql;

-- Function to process a transaction and update account balance
CREATE OR REPLACE FUNCTION process_transaction(
  p_account_id uuid,
  p_type transaction_type,
  p_amount decimal,
  p_description text,
  p_parent_id uuid DEFAULT NULL,
  p_transaction_date date DEFAULT CURRENT_DATE
)
RETURNS uuid AS $$
DECLARE
  current_balance decimal;
  new_balance decimal;
  transaction_id uuid;
BEGIN
  -- Get current balance with row lock
  SELECT balance INTO current_balance
  FROM accounts
  WHERE id = p_account_id
  FOR UPDATE;

  -- Calculate new balance
  IF p_type = 'deposit' OR p_type = 'interest' THEN
    new_balance := current_balance + p_amount;
  ELSIF p_type = 'withdrawal' THEN
    new_balance := current_balance - p_amount;
    IF new_balance < 0 THEN
      RAISE EXCEPTION 'Insufficient funds. Current balance: %, Withdrawal amount: %', current_balance, p_amount;
    END IF;
  END IF;

  -- Update account balance
  UPDATE accounts 
  SET balance = new_balance, updated_at = now()
  WHERE id = p_account_id;

  -- Insert transaction record
  INSERT INTO transactions (account_id, type, amount, balance_after, description, parent_id, transaction_date)
  VALUES (p_account_id, p_type, p_amount, new_balance, p_description, p_parent_id, p_transaction_date)
  RETURNING id INTO transaction_id;

  RETURN transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to interest_tiers for updated_at
CREATE TRIGGER update_interest_tiers_updated_at
  BEFORE UPDATE ON interest_tiers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();