import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { computeDiff, getDiffStats } from '@/lib/doc-diff';

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { documentId, revisionIdA, revisionIdB } = await req.json();

  if (!documentId) {
    return NextResponse.json({ error: 'documentId required' }, { status: 400 });
  }

  // Verify document ownership
  const doc = await prisma.document.findFirst({
    where: { id: documentId, userId: user.id },
  });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let revA, revB;

  if (revisionIdA && revisionIdB) {
    // Compare two specific revisions
    [revA, revB] = await Promise.all([
      prisma.documentRevision.findFirst({ where: { id: revisionIdA, documentId } }),
      prisma.documentRevision.findFirst({ where: { id: revisionIdB, documentId } }),
    ]);
  } else {
    // Compare current with previous revision
    const revisions = await prisma.documentRevision.findMany({
      where: { documentId },
      orderBy: { version: 'desc' },
      take: 2,
    });
    revA = revisions[1] || null; // older
    revB = revisions[0] || null; // newer
  }

  if (!revA && !revB) {
    return NextResponse.json({ error: 'No revisions found' }, { status: 404 });
  }

  const oldContent = revA?.content || '';
  const newContent = revB?.content || doc.content;

  const diffs = computeDiff(oldContent, newContent, 'lines');
  const stats = getDiffStats(diffs);

  return NextResponse.json({
    oldRevision: revA ? { id: revA.id, version: revA.version, title: revA.title, createdAt: revA.createdAt } : null,
    newRevision: revB ? { id: revB.id, version: revB.version, title: revB.title, createdAt: revB.createdAt } : null,
    diffs,
    stats,
  });
}
