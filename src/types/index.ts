import type { Database } from './supabase';

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];

export type Family = Tables<'families'>;
export type Parent = Tables<'parents'>;
export type Child = Tables<'children'>;
export type Account = Tables<'accounts'>;
export type InterestTier = Tables<'interest_tiers'>;
export type Transaction = Tables<'transactions'>;
export type InterestRun = Tables<'interest_runs'>;
export type Goal = Tables<'goals'>;
export type Reward = Tables<'rewards'>;
export type AuditLog = Tables<'audit_log'>;

export type TransactionType = Database['public']['Enums']['transaction_type'];
export type DeliveryStatus = Database['public']['Enums']['delivery_status'];
export type UserType = Database['public']['Enums']['user_type'];

// Extended types with relationships
export interface ChildWithAccount extends Child {
  account: Account | null;
}

export interface TransactionWithDetails extends Transaction {
  parent: Parent | null;
  account: {
    child: Child;
  } | null;
}

export interface GoalWithChild extends Goal {
  child: Child;
}

export interface RewardWithFamily extends Reward {
  family: Family;
  claimed_child: Child | null;
}

// Projection and simulation types
export interface ProjectionPoint {
  month: number;
  balance: number;
  interestEarned: number;
  totalInterest: number;
  date: string;
}

export interface SimulationParams {
  monthlyDeposit?: number;
  monthlyWithdrawal?: number;
  oneTimeDeposit?: number;
  oneTimeDepositMonth?: number;
  oneTimeWithdrawal?: number;
  oneTimeWithdrawalMonth?: number;
}

export interface ProjectionData {
  account_id: string;
  starting_balance: number;
  projections: ProjectionPoint[];
  interest_tiers: InterestTier[];
  generated_at: string;
}

export interface ProjectionWithSimData {
  account_id: string;
  starting_balance: number;
  baseline: ProjectionPoint[];
  simulation: ProjectionPoint[] | null;
  simulation_params: SimulationParams | null;
  interest_tiers: InterestTier[];
  generated_at: string;
}

// Component prop types
export interface BalanceTickerProps {
  accountId: string;
  initialBalance: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  childId: string;
  accountId: string;
  type: 'deposit' | 'withdrawal';
  onSuccess: () => void;
}

export interface ProjectionPlaygroundProps {
  accountId: string;
  initialBalance: number;
}

// Settings and preferences
export interface FamilySettings {
  currency: string;
  sibling_visibility: boolean;
  timezone?: string;
}

export interface ThemePreferences {
  theme: 'light' | 'dark';
  reduce_motion: boolean;
}

// Auth context types
export interface AuthContextType {
  user: any | null;
  parent: Parent | null;
  family: Family | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

// API response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface InterestAccrualResult {
  success: boolean;
  run_date: string;
  accounts_processed: number;
  total_interest_paid: number;
  run_id: string;
}