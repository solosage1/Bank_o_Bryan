'use client';

import Link from 'next/link';

export default function ChildDetailStubPage({ params }: { params: { id: string } }) {
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


