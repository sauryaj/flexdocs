import Link from 'next/link';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { getOrgScope } from '@/lib/org-scope';
import { formatDate } from '@/lib/utils';

export default async function PortalKbList() {
  const user = await auth();
  if (!user?.id) return null;

  const scope = await getOrgScope(user.id, user.role);
  const articles = await prisma.document.findMany({
    where: {
      visibility: 'org',
      isArchived: false,
      ...(scope.mode === 'limited' ? { organizationId: { in: scope.orgIds } } : {}),
    },
    select: { id: true, title: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <Link href="/dashboard/portal" className="text-xs inline-flex items-center gap-1 hover:underline" style={{ color: 'var(--muted)' }}>
          <ArrowLeft className="w-3 h-3" /> Portal
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-1 flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
          <BookOpen className="w-6 h-6" /> Knowledge Base
        </h1>
      </div>
      <div className="card divide-y" style={{ borderColor: 'var(--card-border)' }}>
        {articles.length === 0 ? (
          <p className="px-5 py-8 text-sm text-center" style={{ color: 'var(--muted)' }}>No published articles yet.</p>
        ) : (
          articles.map((a) => (
            <Link key={a.id} href={`/dashboard/portal/kb/${a.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-[var(--surface-1)] transition-colors">
              <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{a.title}</span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{formatDate(a.updatedAt)}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
