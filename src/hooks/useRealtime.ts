'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseRealtimeOptions {
  table: string;
  filter?: string;
  eq?: string;
  onInsert?: (payload: any) => void;
  onUpdate?: (payload: any) => void;
  onDelete?: (payload: any) => void;
}

export function useRealtime({
  table,
  filter,
  eq,
  onInsert,
  onUpdate,
  onDelete
}: UseRealtimeOptions) {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  useEffect(() => {
    // Create channel
    let newChannel = supabase.channel(`realtime-${table}`);

    // Configure postgres changes
    let query = newChannel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        ...(filter && eq ? { filter: `${filter}=eq.${eq}` } : {})
      },
      (payload) => {
        switch (payload.eventType) {
          case 'INSERT':
            onInsert?.(payload);
            break;
          case 'UPDATE':
            onUpdate?.(payload);
            break;
          case 'DELETE':
            onDelete?.(payload);
            break;
        }
      }
    );

    // Subscribe
    query.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Realtime connected to ${table}`);
      } else if (status === 'CHANNEL_ERROR') {
        console.error(`Realtime error on ${table}`);
      }
    });

    setChannel(newChannel);

    // Cleanup
    return () => {
      if (newChannel) {
        newChannel.unsubscribe();
      }
    };
  }, [table, filter, eq, onInsert, onUpdate, onDelete]);

  return channel;
}

// Specialized hook for account balance updates
export function useAccountBalance(accountId: string, onUpdate: (balance: number) => void) {
  return useRealtime({
    table: 'accounts',
    filter: 'id',
    eq: accountId,
    onUpdate: (payload) => {
      if (payload.new?.balance !== undefined) {
        onUpdate(payload.new.balance);
      }
    }
  });
}

// Specialized hook for transaction updates
export function useTransactions(accountId: string, onNewTransaction: (transaction: any) => void) {
  return useRealtime({
    table: 'transactions',
    filter: 'account_id',
    eq: accountId,
    onInsert: (payload) => {
      onNewTransaction(payload.new);
    }
  });
}