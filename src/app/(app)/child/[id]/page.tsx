"use client";

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BalanceTicker } from '@/components/banking/BalanceTicker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface ChildRow {
  id: string;
  name: string;
  nickname: string | null;
  family_id: string | null;
}

interface AccountRow {
  id: string;
  child_id: string;
  balance: number | null;
}

interface TxnRow {
  id: string;
  account_id: string;
  created_at: string;
  amount: number;
  description: string | null;
}

export default function ChildPage() {
  const params = useParams();
  const router = useRouter();
  const { user, family, loading: authLoading } = useAuth();

  const childId = String(params?.id || '');
  const isBypass = useMemo(() => (
    process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === '1' ||
    (typeof window !== 'undefined' && (
      new URLSearchParams(window.location.search).get('e2e') === '1' ||
      window.localStorage.getItem('E2E_BYPASS') === '1'
    ))
  ), []);

  const [loading, setLoading] = useState(true);
  const [child, setChild] = useState<ChildRow | null>(null);
  const [account, setAccount] = useState<AccountRow | null>(null);
  const [txns, setTxns] = useState<TxnRow[]>([]);

  useEffect(() => {
    if (isBypass) return; // allow access in E2E bypass
    if (authLoading) return;
    if (!user) {
      router.replace('/');
      return;
    }
    if (user && !family) {
      router.replace('/onboarding');
      return;
    }
  }, [authLoading, user, family, router, isBypass]);

  useEffect(() => {
    let aborted = false;
    const load = async () => {
      setLoading(true);
      try {
        // Fetch child
        const { data: childRow, error: childErr } = await supabase
          .from('children')
          .select('id, name, nickname, family_id')
          .eq('id', childId)
          .maybeSingle();
        if (childErr) throw childErr;
        if (aborted) return;
        setChild(childRow as any);

        // Fetch account for child
        const { data: acctRow } = await supabase
          .from('accounts')
          .select('id, child_id, balance')
          .eq('child_id', childId)
          .maybeSingle();
        if (aborted) return;
        setAccount(acctRow as any);

        // Fetch recent transactions if account exists
        if (acctRow?.id) {
          const { data: txnRows } = await supabase
            .from('transactions')
            .select('id, account_id, created_at, amount, description')
            .eq('account_id', acctRow.id)
            .order('created_at', { ascending: false })
            .limit(10);
          if (aborted) return;
          setTxns(txnRows as any || []);
        } else {
          setTxns([]);
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    };
    if (childId) load();
    return () => { aborted = true; };
  }, [childId]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-4">
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">
              {child ? (
                <>
                  {child.name}
                  {child.nickname ? (
                    <span className="text-lg text-gray-500 font-normal"> ({child.nickname})</span>
                  ) : null}
                </>
              ) : (
                loading ? 'Loading…' : 'Child not found'
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-lg">
                    {(child?.name || '?').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="text-gray-600">Current Balance</div>
              </div>
              <div>
                {account ? (
                  <BalanceTicker
                    accountId={account.id}
                    initialBalanceCents={Math.round((account.balance || 0) * 100)}
                    size="md"
                    showIcon={false}
                  />
                ) : (
                  <div className="text-gray-500">No account</div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Recent Transactions</div>
              {child && (
                <Button onClick={() => router.push(`/child/${child.id}/playground`)}>
                  Go to Projection Playground
                </Button>
              )}
            </div>

            <div className="bg-white rounded-lg border divide-y">
              {txns.length === 0 ? (
                <div className="p-4 text-gray-500">No transactions yet.</div>
              ) : (
                txns.map(t => (
                  <div key={t.id} className="p-4 flex items-center justify-between">
                    <div className="text-sm text-gray-600">{new Date(t.created_at).toLocaleString()}</div>
                    <div className="flex-1 mx-4 text-gray-900">{t.description || 'Transaction'}</div>
                    <div className={t.amount >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                      {t.amount >= 0 ? '+' : ''}{formatCurrency(t.amount)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

