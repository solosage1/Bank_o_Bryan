'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Point = { date: string; balance_cents: number };

export default function PlaygroundPage() {
  const params = useParams();
  const childId = params?.id as string;
  const [baseline, setBaseline] = useState<Point[]>([]);
  const [simulated, setSimulated] = useState<Point[] | null>(null);
  const [amount, setAmount] = useState<number>(1000);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: account } = await supabase
        .from('accounts')
        .select('id')
        .eq('child_id', childId)
        .maybeSingle();
      if (!account) return;
      setAccountId(account.id);
      const url = new URL('/functions/v1/projection', window.location.origin);
      url.searchParams.set('account_id', account.id);
      const res = await fetch(url.toString());
      const json = await res.json();
      setBaseline(json.baseline || []);
    })();
  }, [childId]);

  const runSim = async (kind: 'deposit'|'withdrawal') => {
    if (!accountId) return;
    const res = await fetch('/functions/v1/projectionWithSim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId, simulation: { what_if: { type: kind, amount_cents: Math.round(amount), date } } })
    });
    const json = await res.json();
    setSimulated(json.simulated || null);
  };

  const delta = useMemo(() => {
    if (!baseline || !simulated) return 0;
    const last = baseline[baseline.length - 1]?.balance_cents ?? 0;
    const lastSim = simulated[simulated.length - 1]?.balance_cents ?? 0;
    return lastSim - last;
  }, [baseline, simulated]);

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Projection Playground</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row md:items-end gap-3 mb-4">
            <div>
              <label htmlFor="amount" className="block text-sm font-medium mb-1">Amount (cents)</label>
              <input id="amount" className="border rounded px-2 py-1" type="number" value={amount} onChange={e => setAmount(parseInt(e.target.value || '0', 10))} />
            </div>
            <div>
              <label htmlFor="date" className="block text-sm font-medium mb-1">Date</label>
              <input id="date" className="border rounded px-2 py-1" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => runSim('deposit')}>Sim Deposit</Button>
              <Button variant="outline" onClick={() => runSim('withdrawal')}>Sim Withdraw</Button>
            </div>
          </div>
          <div className="text-sm text-gray-700 mb-2">Delta at horizon: {(delta/100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</div>
          <div className="grid grid-cols-2 gap-4 max-h-64 overflow-auto">
            <div>
              <div className="font-medium mb-1">Baseline</div>
              <ul className="text-xs space-y-1">
                {baseline.slice(0, 30).map((p, i) => (
                  <li key={i}>{p.date}: {(p.balance_cents/100).toFixed(2)}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-medium mb-1">Ghost Curve</div>
              <ul className="text-xs space-y-1">
                {simulated?.slice(0, 30).map((p, i) => (
                  <li key={i}>{p.date}: {(p.balance_cents/100).toFixed(2)}</li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


