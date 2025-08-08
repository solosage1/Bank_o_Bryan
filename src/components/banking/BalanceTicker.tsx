'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DollarSign, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAccountBalance } from '@/hooks/useRealtime';
import { computeTickerValue, TickerBase } from '@/lib/interest/ticker';
import { supabase } from '@/lib/supabase';

interface BalanceTickerProps {
  accountId: string;
  initialBalanceCents: number;
  tiers?: { lower_cents: number; upper_cents?: number; apr_bps: number }[];
  reducedMotion?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showIcon?: boolean;
  showTrend?: boolean;
}

export function BalanceTicker({
  accountId,
  initialBalanceCents,
  tiers = [],
  reducedMotion = false,
  size = 'md',
  className,
  showIcon = true,
  showTrend = false
}: BalanceTickerProps) {
  const [balanceCents, setBalanceCents] = useState(initialBalanceCents);
  const [previousBalanceCents, setPreviousBalanceCents] = useState(initialBalanceCents);
  const [isAnimating, setIsAnimating] = useState(false);
  const [tickerBase, setTickerBase] = useState<TickerBase>({
    base_value_cents: initialBalanceCents,
    base_timestamp_ms: Date.now(),
    tiers
  });

  // Subscribe to realtime balance updates
  useAccountBalance(accountId, (newBalance: number) => {
    const newCents = Math.round(newBalance * 100);
    setPreviousBalanceCents(balanceCents);
    setBalanceCents(newCents);
    setTickerBase({ base_value_cents: newCents, base_timestamp_ms: Date.now(), tiers });
    setIsAnimating(true);
    
    // Reset animation state
    setTimeout(() => setIsAnimating(false), 1000);
  });

  // Local per-second ticker
  useEffect(() => {
    if (reducedMotion || tiers.length === 0) return;
    const id = setInterval(() => {
      const val = computeTickerValue(Date.now(), tickerBase);
      setBalanceCents(Math.round(val));
    }, 1000);
    return () => clearInterval(id);
  }, [tickerBase, reducedMotion, tiers]);

  // Periodic rebase from server authority
  useEffect(() => {
    if (!accountId) return;
    const id = setInterval(async () => {
      const { data } = await supabase
        .from('accounts')
        .select('current_balance_cents, as_of')
        .eq('id', accountId)
        .maybeSingle();
      if (data?.current_balance_cents != null) {
        setTickerBase({
          base_value_cents: data.current_balance_cents,
          base_timestamp_ms: Date.now(),
          tiers
        });
      }
    }, 60000);
    return () => clearInterval(id);
  }, [accountId, tiers]);

  const formatBalance = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(cents / 100);
  };

  const sizeClasses = {
    sm: 'text-lg font-semibold',
    md: 'text-2xl font-bold',
    lg: 'text-4xl font-bold'
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  const balanceChange = balanceCents - previousBalanceCents;
  const isIncrease = balanceChange > 0;
  const isDecrease = balanceChange < 0;

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      {showIcon && (
        <div className={cn(
          'flex items-center justify-center rounded-full',
          isAnimating && isIncrease ? 'bg-green-100 text-green-600' : 
          isAnimating && isDecrease ? 'bg-red-100 text-red-600' : 
          'bg-blue-100 text-blue-600',
          size === 'sm' ? 'w-8 h-8' : size === 'md' ? 'w-10 h-10' : 'w-12 h-12'
        )}>
          <motion.div
            animate={isAnimating ? { scale: [1, 1.2, 1] } : {}}
            transition={{ duration: 0.5 }}
          >
            <DollarSign className={iconSizes[size]} />
          </motion.div>
        </div>
      )}

      <div className="flex-1">
        <motion.div
          key={balanceCents}
          initial={{ opacity: 0, y: isIncrease ? -10 : isDecrease ? 10 : 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={cn(
            sizeClasses[size],
            isAnimating && isIncrease ? 'text-green-600' :
            isAnimating && isDecrease ? 'text-red-600' :
            'text-gray-900'
          )}
        >
          {formatBalance(balanceCents)}
        </motion.div>

        <AnimatePresence>
          {showTrend && isAnimating && balanceChange !== 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3 }}
              className={cn(
                'flex items-center space-x-1 text-xs font-medium mt-1',
                isIncrease ? 'text-green-600' : 'text-red-600'
              )}
            >
              <TrendingUp className={cn(
                'w-3 h-3',
                isDecrease && 'rotate-180'
              )} />
              <span>
                {isIncrease ? '+' : ''}{formatBalance(balanceChange)}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}