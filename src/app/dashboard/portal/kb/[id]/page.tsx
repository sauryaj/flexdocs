import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Lock } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { canAccessOrganization } from '@/lib/org-scope';
import { formatDate } from '@/lib/utils';
import { MarkdownPreview } from '@/components/MarkdownPreview';

export default async function PortalKbArticle({ params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return null;
  const { id } = await params;

  const doc = await prisma.document.findUnique({
    where: { id },
    select: {
      title: true,
      content: true,
      updatedAt: true,
      visibility: true,
      organizationId: true,
    },
  });
  if (!doc || doc.visibility !== 'org' || !doc.organizationId) notFound();
  if (!(await canAccessOrganization(user.id, user.role, doc.organizationId))) notFound();

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link href="/dashboard/portal/kb" className="text-xs inline-flex items-center gap-1 hover:underline" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="w-3 h-3" /> Knowledge Base
      </Link>
      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3" style={{ color: 'var(--foreground)' }}>
        <Lock className="w-5 h-5 shrink-0" style={{ color: 'var(--accent)' }} />
        {doc.title}
      </h1>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>Last updated {formatDate(doc.updatedAt)}</p>
      <div className="card p-8 min-h-[300px]">
        {doc.content.trim() ? (
          <MarkdownPreview content={doc.content} />
        ) : (
          <p className="text-sm italic text-center py-10" style={{ color: 'var(--muted)' }}>Empty article.</p>
        )}
      </div>
    </div>
  );
}
