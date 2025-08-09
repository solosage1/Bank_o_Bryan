"use client";

import Link from 'next/link';
import { useRequireAuth } from '@/hooks/useRequireAuth';

export default function ChildDetailStubPage({ params }: { params: { id: string } }) {
  const status = useRequireAuth();

  if (status !== 'ready') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading…</p>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
      <h1 className="text-3xl font-bold mb-4">Child Detail (Stub)</h1>
      <p className="text-gray-600 mb-6">Child ID: {params.id}</p>
      <div className="space-x-4">
        <Link className="underline text-blue-600" href={`/child/${params.id}/history`}>History</Link>
        <Link className="underline text-blue-600" href={`/child/${params.id}/projection`}>Projection</Link>
        <Link className="underline text-blue-600" href={`/child/${params.id}/playground`}>Playground</Link>
      </div>
    </div>
  );
}


