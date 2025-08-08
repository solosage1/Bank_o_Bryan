export const metadata = {
  title: "Terms of Service - Bank o'Bryan",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <a
          href="/"
          className="inline-block mb-6 text-blue-700 hover:text-blue-800 underline underline-offset-2"
        >
          ← Back to Home
        </a>
        <div className="bg-white/90 border border-gray-200 rounded-2xl shadow-xl p-8">
          <h1 className="text-3xl font-bold mb-4 text-gray-900">Terms of Service</h1>
          <p className="text-gray-600 mb-6">
            These terms govern your use of Bank o&apos;Bryan. This is a virtual, educational banking
            experience and does not involve real money or financial services.
          </p>
          <section className="space-y-4 text-gray-700">
            <p>By using the site, you agree to act responsibly and respect other users.</p>
            <p>We may update these terms from time to time. Continued use constitutes acceptance.</p>
            <p>For questions, please contact support.</p>
          </section>
        </div>
      </div>
    </main>
  );
}


