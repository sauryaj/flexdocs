import { PrismaClient, Prisma } from '@prisma/client';
import { ownershipPreflight } from '../src/lib/ownership-preflight';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Set an explicit DATABASE_URL for the installation being inspected');
  const db = new PrismaClient();
  try {
    const report = await db.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const folders = await tx.folder.findMany({ select: { id: true, userId: true, organizationId: true, parentId: true } });
      const documents = await tx.document.findMany({ select: { id: true, userId: true, organizationId: true, folderId: true, visibility: true, isArchived: true, deletedAt: true } });
      return ownershipPreflight(folders, documents);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60_000 });
    console.log(JSON.stringify(report, null, 2));
    if (!report.ready) process.exitCode = 2;
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error('Ownership preflight failed; verify database access. No migration was performed.'); process.exitCode = 1; });
