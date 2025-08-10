import Providers from '@/app/_components/Providers';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers> as React.ReactElement;
}


