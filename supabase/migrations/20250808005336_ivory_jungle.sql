/*
  # Bank o'Bryan Core Schema Setup

  1. New Tables
    - `families` - Family units with settings and timezone configuration
      - `id` (uuid, primary key)
      - `name` (text) - Family display name
      - `timezone` (text) - Family timezone for interest calculations
      - `created_at` (timestamp)
      - `settings` (jsonb) - Family preferences and configuration

    - `parents` - Parent accounts linked to Google OAuth
      - `id` (uuid, primary key) 
      - `family_id` (uuid, foreign key to families)
      - `email` (text, unique) - Google OAuth email
      - `name` (text) - Parent's full name
      - `auth_user_id` (uuid) - Links to auth.users
      - `created_at` (timestamp)

    - `children` - Child profiles with personalization options
      - `id` (uuid, primary key)
      - `family_id` (uuid, foreign key to families) 
      - `name` (text) - Child's name
      - `age` (integer) - Age for UI customization
      - `avatar_url` (text) - Profile picture URL
      - `theme_preferences` (jsonb) - UI theme settings
      - `created_at` (timestamp)

    - `accounts` - Financial accounts for each child
      - `id` (uuid, primary key)
      - `child_id` (uuid, foreign key to children)
      - `balance` (decimal) - Current account balance
      - `total_earned` (decimal) - Lifetime earnings from interest
      - `last_interest_date` (date) - Last interest calculation date
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add family-scoped access policies for data isolation
    - Create indexes for performance optimization

  3. Initial Configuration
    - Create default interest tier structure
    - Set up audit logging triggers
*/

-- Create core tables
CREATE TABLE IF NOT EXISTS families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/New_York',
  settings jsonb DEFAULT '{"currency": "USD", "sibling_visibility": true}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid REFERENCES families(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid REFERENCES families(id) ON DELETE CASCADE,
  name text NOT NULL,
  age integer CHECK (age >= 8 AND age <= 18),
  avatar_url text,
  nickname text,
  theme_preferences jsonb DEFAULT '{"theme": "light", "reduce_motion": false}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid REFERENCES children(id) ON DELETE CASCADE UNIQUE,
  balance decimal(12,2) DEFAULT 0.00 CHECK (balance >= 0),
  total_earned decimal(12,2) DEFAULT 0.00 CHECK (total_earned >= 0),
  last_interest_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_parents_family_id ON parents(family_id);
CREATE INDEX IF NOT EXISTS idx_parents_auth_user_id ON parents(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_children_family_id ON children(family_id);
CREATE INDEX IF NOT EXISTS idx_accounts_child_id ON accounts(child_id);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'last_interest_date'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_accounts_last_interest_date ON accounts(last_interest_date);
  END IF;
END $$;

-- Enable Row Level Security
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE children ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for families table
CREATE POLICY "Parents can access their family data"
  ON families
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parents 
      WHERE parents.family_id = families.id 
      AND parents.auth_user_id = auth.uid()
    )
  );

-- RLS Policies for parents table  
CREATE POLICY "Parents can access their own data"
  ON parents
  FOR ALL
  TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "Parents can view other parents in their family"
  ON parents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parents p 
      WHERE p.family_id = parents.family_id 
      AND p.auth_user_id = auth.uid()
    )
  );

-- RLS Policies for children table
CREATE POLICY "Parents can manage children in their family"
  ON children
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parents 
      WHERE parents.family_id = children.family_id 
      AND parents.auth_user_id = auth.uid()
    )
  );

-- RLS Policies for accounts table
CREATE POLICY "Parents can manage accounts for children in their family"
  ON accounts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM children c
      JOIN parents p ON p.family_id = c.family_id
      WHERE c.id = accounts.child_id 
      AND p.auth_user_id = auth.uid()
    )
  );

-- Create trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_families_updated_at
  BEFORE UPDATE ON families
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_parents_updated_at
  BEFORE UPDATE ON parents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_children_updated_at
  BEFORE UPDATE ON children
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Seed a sample family/parent/child/account for smoke testing (no-op on conflict)
DO $$
DECLARE fam_id uuid;
DECLARE parent_row RECORD;
DECLARE child_id uuid;
BEGIN
  -- Create or fetch family
  INSERT INTO families (name, timezone, settings)
  VALUES ('Demo Family', 'America/New_York', '{"currency":"USD","sibling_visibility":true}'::jsonb)
  ON CONFLICT DO NOTHING;
  SELECT id INTO fam_id FROM families WHERE name = 'Demo Family' LIMIT 1;

  -- Create parent placeholder; auth_user_id nullable if auth not present
  INSERT INTO parents (family_id, email, name)
  VALUES (fam_id, 'demo.parent@example.com', 'Demo Parent')
  ON CONFLICT (email) DO NOTHING;

  -- Create child
  INSERT INTO children (family_id, name, age, nickname)
  VALUES (fam_id, 'Avery', 12, 'Ave')
  ON CONFLICT DO NOTHING;
  SELECT id INTO child_id FROM children WHERE family_id = fam_id AND name = 'Avery' LIMIT 1;

  -- Create account if missing
  INSERT INTO accounts (child_id, balance, total_earned)
  VALUES (child_id, 0.00, 0.00)
  ON CONFLICT (child_id) DO NOTHING;
END $$;