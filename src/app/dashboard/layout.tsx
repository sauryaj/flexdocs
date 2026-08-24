import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { ApiAuthGuard } from '@/components/ApiAuthGuard';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
      <ApiAuthGuard />
      <Sidebar />
      <div className="lg:ml-60 transition-all duration-300">
        <Header />
        <main className="p-6 page-enter">{children}</main>
      </div>
    </div>
  );
}
