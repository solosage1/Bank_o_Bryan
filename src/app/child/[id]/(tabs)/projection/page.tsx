'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRequireAuth } from '@/hooks/useRequireAuth';

type Point = { date: string; balance_cents: number };

export default function ProjectionPage() {
  const guard = useRequireAuth();
  const params = useParams();
  const childId = params?.id as string;
  const [points, setPoints] = useState<Point[]>([]);
  const [isFetching, setIsFetching] = useState<boolean>(false);

  useEffect(() => {
    if (guard !== 'ready') return;
    let cancelled = false;
    (async () => {
      setIsFetching(true);
      const { data: account } = await supabase
        .from('accounts')
        .select('id')
        .eq('child_id', childId)
        .maybeSingle();
      if (!account) { setIsFetching(false); return; }
      const url = new URL('/functions/v1/projection', window.location.origin);
      url.searchParams.set('account_id', account.id);
      const res = await fetch(url.toString());
      const json = await res.json();
      if (!cancelled) setPoints(json.baseline || []);
      setIsFetching(false);
    })();
    return () => { cancelled = true; };
  }, [childId, guard]);

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Projection (12 months, daily)</CardTitle>
        </CardHeader>
        <CardContent>
          {isFetching && (
            <div className="text-gray-600 text-sm mb-2">Loading...</div>
          )}
          <div className="text-sm text-gray-600 mb-2">Points: {points.length}</div>
          <div className="max-h-64 overflow-auto border rounded">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Balance</th>
                </tr>
              </thead>
              <tbody>
                {points.slice(0, 60).map((p, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 pr-4">{p.date}</td>
                    <td className="py-2 pr-4">{(p.balance_cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <Button onClick={() => {
              const header = 'Date,Balance\n';
              const rows = points.map(p => `${p.date},${(p.balance_cents/100).toFixed(2)}`).join('\n');
              const csv = header + rows;
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'projection.csv';
              a.click();
              URL.revokeObjectURL(url);
            }}>Export CSV</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


