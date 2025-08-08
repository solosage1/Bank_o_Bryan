/*
  # Goals, Rewards, and Audit System

  1. New Tables
    - `goals` - Savings goals with target amounts and dates
      - `id` (uuid, primary key)
      - `child_id` (uuid, foreign key to children)
      - `title` (text) - Goal name/description
      - `target_amount` (decimal) - Amount needed to reach goal
      - `target_date` (date) - When child wants to reach goal
      - `current_progress` (decimal) - How much has been saved toward goal
      - `is_completed` (boolean) - Whether goal has been achieved
      - `reward_id` (uuid) - Optional linked reward

    - `rewards` - Reward system with delivery tracking
      - `id` (uuid, primary key)
      - `family_id` (uuid, foreign key to families)
      - `title` (text) - Reward name
      - `description` (text) - Reward details
      - `cost` (decimal) - How much the reward costs
      - `is_available` (boolean) - Whether reward can be claimed
      - `delivery_status` (enum) - 'pending', 'delivered', 'cancelled'

    - `audit_log` - Comprehensive activity logging
      - `id` (uuid, primary key)  
      - `family_id` (uuid, foreign key to families)
      - `user_type` (enum) - 'parent', 'child', 'system'
      - `user_id` (uuid) - ID of user who performed action
      - `action` (text) - Description of action taken
      - `entity_type` (text) - Type of entity affected
      - `entity_id` (uuid) - ID of affected entity
      - `metadata` (jsonb) - Additional context data
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables with family-scoped access
    - Create policies for goal and reward management
    - Ensure audit logs are immutable (insert-only)

  3. Functions
    - Goal progress calculation triggers
    - Automatic reward eligibility checking
*/

-- Create delivery status enum
CREATE TYPE delivery_status AS ENUM ('pending', 'delivered', 'cancelled');
CREATE TYPE user_type AS ENUM ('parent', 'child', 'system');

-- Create goals and rewards tables
CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid REFERENCES children(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  target_amount decimal(12,2) NOT NULL CHECK (target_amount > 0),
  target_date date,
  current_progress decimal(12,2) DEFAULT 0.00 CHECK (current_progress >= 0),
  is_completed boolean DEFAULT false,
  reward_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid REFERENCES families(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  cost decimal(12,2) NOT NULL CHECK (cost > 0),
  is_available boolean DEFAULT true,
  delivery_status delivery_status DEFAULT 'pending',
  claimed_by uuid REFERENCES children(id),
  claimed_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid REFERENCES families(id) ON DELETE CASCADE,
  user_type user_type NOT NULL,
  user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Ensure goals.reward_id exists before adding FK (in case goals table pre-existed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'goals' AND column_name = 'reward_id'
  ) THEN
    ALTER TABLE goals ADD COLUMN reward_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_goals_reward_id'
      AND conrelid = 'public.goals'::regclass
  ) THEN
    ALTER TABLE goals 
      ADD CONSTRAINT fk_goals_reward_id 
      FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_goals_child_id ON goals(child_id);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'goals' AND column_name = 'is_completed'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_goals_completed ON goals(is_completed, target_date);
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'rewards' AND column_name = 'family_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_rewards_family_id ON rewards(family_id);
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'rewards' AND column_name = 'is_available'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_rewards_available ON rewards(is_available, cost);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_audit_log_family_id ON audit_log(family_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);

-- Enable Row Level Security
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for goals
CREATE POLICY "Parents can manage goals for their family children"
  ON goals
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM children c
      JOIN parents p ON p.family_id = c.family_id
      WHERE c.id = goals.child_id 
      AND p.auth_user_id = auth.uid()
    )
  );

-- RLS Policies for rewards
CREATE POLICY "Parents can manage rewards for their family"
  ON rewards
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parents 
      WHERE parents.family_id = rewards.family_id 
      AND parents.auth_user_id = auth.uid()
    )
  );

-- RLS Policies for audit_log (insert and read only)
CREATE POLICY "Parents can view audit logs for their family"
  ON audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parents 
      WHERE parents.family_id = audit_log.family_id 
      AND parents.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert audit logs"
  ON audit_log
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (true);

-- Function to update goal progress based on account balance
CREATE OR REPLACE FUNCTION update_goal_progress()
RETURNS TRIGGER AS $$
DECLARE
  goal_record RECORD;
BEGIN
  -- Update progress for all active goals for this child
  FOR goal_record IN
    SELECT g.id, g.target_amount, a.balance
    FROM goals g
    JOIN accounts a ON a.child_id = g.child_id
    WHERE g.child_id = (
      SELECT child_id FROM accounts WHERE id = NEW.account_id
    )
    AND g.is_completed = false
  LOOP
    -- Update progress (limited to target amount)
    UPDATE goals
    SET 
      current_progress = LEAST(goal_record.balance, goal_record.target_amount),
      is_completed = (goal_record.balance >= goal_record.target_amount),
      updated_at = now()
    WHERE id = goal_record.id;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update goal progress when account balance changes
CREATE TRIGGER trigger_update_goal_progress
  AFTER UPDATE OF balance ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_goal_progress();

-- Function to log audit events
CREATE OR REPLACE FUNCTION log_audit_event(
  p_family_id uuid,
  p_user_type user_type,
  p_user_id uuid,
  p_action text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid AS $$
DECLARE
  audit_id uuid;
BEGIN
  INSERT INTO audit_log (family_id, user_type, user_id, action, entity_type, entity_id, metadata)
  VALUES (p_family_id, p_user_type, p_user_id, p_action, p_entity_type, p_entity_id, p_metadata)
  RETURNING id INTO audit_id;
  
  RETURN audit_id;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at columns
CREATE TRIGGER update_goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rewards_updated_at
  BEFORE UPDATE ON rewards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();