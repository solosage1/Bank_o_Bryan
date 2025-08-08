export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      families: {
        Row: {
          id: string
          name: string
          timezone: string
          sibling_visibility: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          timezone?: string
          sibling_visibility?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          timezone?: string
          sibling_visibility?: boolean
          created_at?: string
        }
        Relationships: []
      }
      parents: {
        Row: {
          id: string
          family_id: string | null
          email: string
          name: string
          auth_user_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          family_id?: string | null
          email: string
          name: string
          auth_user_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          family_id?: string | null
          email?: string
          name?: string
          auth_user_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parents_auth_user_id_fkey"
            columns: ["auth_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parents_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          }
        ]
      }
      children: {
        Row: {
          id: string
          family_id: string | null
          name: string
          age: number | null
          avatar_url: string | null
          nickname: string | null
          theme_preferences: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          family_id?: string | null
          name: string
          age?: number | null
          avatar_url?: string | null
          nickname?: string | null
          theme_preferences?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          family_id?: string | null
          name?: string
          age?: number | null
          avatar_url?: string | null
          nickname?: string | null
          theme_preferences?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "children_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          }
        ]
      }
      accounts: {
        Row: {
          id: string
          child_id: string | null
          balance: number
          total_earned: number
          last_interest_date: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          child_id?: string | null
          balance?: number
          total_earned?: number
          last_interest_date?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          child_id?: string | null
          balance?: number
          total_earned?: number
          last_interest_date?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: true
            referencedRelation: "children"
            referencedColumns: ["id"]
          }
        ]
      }
      interest_tiers: {
        Row: {
          id: string
          min_balance: number
          max_balance: number | null
          annual_rate: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          min_balance?: number
          max_balance?: number | null
          annual_rate: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          min_balance?: number
          max_balance?: number | null
          annual_rate?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          id: string
          account_id: string | null
          type: 'deposit' | 'withdrawal' | 'interest'
          amount: number
          balance_after: number
          description: string
          parent_id: string | null
          transaction_date: string
          created_at: string
        }
        Insert: {
          id?: string
          account_id?: string | null
          type: 'deposit' | 'withdrawal' | 'interest'
          amount: number
          balance_after: number
          description: string
          parent_id?: string | null
          transaction_date?: string
          created_at?: string
        }
        Update: {
          id?: string
          account_id?: string | null
          type?: 'deposit' | 'withdrawal' | 'interest'
          amount?: number
          balance_after?: number
          description?: string
          parent_id?: string | null
          transaction_date?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          }
        ]
      }
      interest_runs: {
        Row: {
          id: string
          run_date: string
          accounts_processed: number
          total_interest_paid: number
          started_at: string
          completed_at: string | null
          status: string
        }
        Insert: {
          id?: string
          run_date: string
          accounts_processed?: number
          total_interest_paid?: number
          started_at?: string
          completed_at?: string | null
          status?: string
        }
        Update: {
          id?: string
          run_date?: string
          accounts_processed?: number
          total_interest_paid?: number
          started_at?: string
          completed_at?: string | null
          status?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          id: string
          child_id: string | null
          title: string
          description: string | null
          target_amount: number
          target_date: string | null
          current_progress: number
          is_completed: boolean
          reward_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          child_id?: string | null
          title: string
          description?: string | null
          target_amount: number
          target_date?: string | null
          current_progress?: number
          is_completed?: boolean
          reward_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          child_id?: string | null
          title?: string
          description?: string | null
          target_amount?: number
          target_date?: string | null
          current_progress?: number
          is_completed?: boolean
          reward_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_goals_reward_id"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          }
        ]
      }
      rewards: {
        Row: {
          id: string
          family_id: string | null
          title: string
          description: string | null
          cost: number
          is_available: boolean
          delivery_status: 'pending' | 'delivered' | 'cancelled'
          claimed_by: string | null
          claimed_at: string | null
          delivered_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          family_id?: string | null
          title: string
          description?: string | null
          cost: number
          is_available?: boolean
          delivery_status?: 'pending' | 'delivered' | 'cancelled'
          claimed_by?: string | null
          claimed_at?: string | null
          delivered_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          family_id?: string | null
          title?: string
          description?: string | null
          cost?: number
          is_available?: boolean
          delivery_status?: 'pending' | 'delivered' | 'cancelled'
          claimed_by?: string | null
          claimed_at?: string | null
          delivered_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          }
        ]
      }
      audit_log: {
        Row: {
          id: string
          family_id: string | null
          user_type: 'parent' | 'child' | 'system'
          user_id: string | null
          action: string
          entity_type: string | null
          entity_id: string | null
          metadata: Json | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          family_id?: string | null
          user_type: 'parent' | 'child' | 'system'
          user_id?: string | null
          action: string
          entity_type?: string | null
          entity_id?: string | null
          metadata?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          family_id?: string | null
          user_type?: 'parent' | 'child' | 'system'
          user_id?: string | null
          action?: string
          entity_type?: string | null
          entity_id?: string | null
          metadata?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_daily_interest: {
        Args: {
          account_balance: number
          account_id: string
        }
        Returns: number
      }
      process_transaction: {
        Args: {
          p_account_id: string
          p_type: 'deposit' | 'withdrawal' | 'interest'
          p_amount: number
          p_description: string
          p_parent_id?: string
          p_transaction_date?: string
        }
        Returns: string
      }
      log_audit_event: {
        Args: {
          p_family_id: string
          p_user_type: 'parent' | 'child' | 'system'
          p_user_id: string
          p_action: string
          p_entity_type?: string
          p_entity_id?: string
          p_metadata?: Json
        }
        Returns: string
      }
    }
    Enums: {
      delivery_status: 'pending' | 'delivered' | 'cancelled'
      transaction_type: 'deposit' | 'withdrawal' | 'interest'
      user_type: 'parent' | 'child' | 'system'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}