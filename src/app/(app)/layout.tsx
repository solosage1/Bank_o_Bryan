export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Providers (Auth + Toaster) are mounted once at the root layout via `src/app/layout.tsx`.
  // Avoid double-mounting here to prevent duplicate toasts and duplicated context providers.
  return children as React.ReactElement;
}


