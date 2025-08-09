export default function NotFound() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white/90 border border-gray-200 shadow-xl rounded-2xl p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Page not found</h1>
        <p className="text-gray-600 mt-2">
          The page you’re looking for doesn’t exist. It may have been moved.
        </p>
        <a
          href="/"
          className="inline-block mt-6 px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium hover:from-blue-700 hover:to-indigo-700"
        >
          Go back home
        </a>
      </div>
    </main>
  );
}


