'use client';

import { useState } from 'react';

export default function PlaygroundStubPage() {
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState<string>('');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center space-y-4">
      <h1 className="text-3xl font-bold mb-2">Projection Playground (Stub)</h1>
      <div className="w-full max-w-md space-y-3 text-left">
        <label className="block text-sm font-medium text-gray-700" htmlFor="sim-amount">Amount</label>
        <input
          id="sim-amount"
          aria-label="Simulation amount"
          type="number"
          className="w-full border rounded px-3 py-2"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
        />
        <label className="block text-sm font-medium text-gray-700 mt-2" htmlFor="sim-date">Date</label>
        <input
          id="sim-date"
          aria-label="Simulation date"
          type="date"
          className="w-full border rounded px-3 py-2"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <p className="text-gray-600">Ghost curve + delta table will appear here.</p>
    </div>
  );
}


