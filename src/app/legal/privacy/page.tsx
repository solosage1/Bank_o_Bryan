export const metadata = {
  title: "Privacy Policy - Bank o'Bryan",
};

export default function PrivacyPage() {
  return (
    <main className="container mx-auto px-4 py-12 max-w-3xl">
      <h1 className="text-3xl font-bold mb-4">Privacy Policy</h1>
      <p className="text-gray-600 mb-6">
        We respect your privacy. Bank o&apos;Bryan stores only the data necessary to operate the
        app experience. We do not sell personal information.
      </p>
      <section className="space-y-4 text-gray-700">
        <p>Authentication is handled by your chosen provider. Session data is managed securely.</p>
        <p>You can request deletion of your account and associated data.</p>
        <p>We may update this policy as our product evolves.</p>
      </section>
    </main>
  );
}


