'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Txn = { id: string; type: string; amount_cents: number; occurred_at: string; note: string };

export default function HistoryPage() {
  const params = useParams();
  const childId = params?.id as string;
  const [transactions, setTransactions] = useState<Txn[]>([]);

  useEffect(() => {
    (async () => {
      // find account by child
      const { data: account } = await supabase
        .from('accounts')
        .select('id')
        .eq('child_id', childId)
        .maybeSingle();
      if (!account) return;
      const { data } = await supabase
        .from('transactions_prd')
        .select('id, type, amount_cents, occurred_at, note')
        .eq('account_id', account.id)
        .order('occurred_at', { ascending: false });
      setTransactions((data as Txn[]) || []);
    })();
  }, [childId]);

  const toCurrency = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{t.occurred_at}</td>
                    <td className="py-2 pr-4">{t.type}</td>
                    <td className="py-2 pr-4">{toCurrency(t.amount_cents)}</td>
                    <td className="py-2">{t.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <Button
              onClick={() => {
                const header = 'Date,Type,Amount,Note\n';
                const rows = transactions
                  .map((t) => `${t.occurred_at},${t.type},${(t.amount_cents / 100).toFixed(2)},"${(t.note || '').replace(/"/g, '""')}"`)
                  .join('\n');
                const csv = header + rows;
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'history.csv';
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


