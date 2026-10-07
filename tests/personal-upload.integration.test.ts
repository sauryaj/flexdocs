import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
vi.mock('@/lib/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return { prisma: new PrismaClient() };
});
import { prisma } from '@/lib/prisma';
import { storeFileBytes } from '@/lib/file-storage';
import { lockDocumentationAdministration } from '@/lib/documentation-grants';

function barrier() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

async function waitForBlockedWriter() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const rows = await prisma.$queryRaw<{ blocked: boolean }[]>`SELECT EXISTS (
      SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
      AND cardinality(pg_blocking_pids(pid)) > 0 AND query LIKE '%pg_advisory_xact_lock%'
    ) AS blocked`;
    if (rows[0].blocked) return;
    await new Promise(done => setTimeout(done, 10));
  }
  throw new Error('Expected ownership/upload writer to wait for administration lock');
}

it.skipIf(process.env.DOCUMENT_TEST_ISOLATED !== '1' || !process.env.DATABASE_URL || !process.env.UPLOAD_DIR)(
  'serializes personal uploads with ownership changes and rechecks current authority', async () => {
    const token = randomUUID();
    const files: string[] = [];
    const gates: ReturnType<typeof barrier>[] = [];
    let userId: string | undefined, otherId: string | undefined, organizationId: string | undefined, documentId: string | undefined;
    const pending: Promise<unknown>[] = [];
    try {
      userId = (await prisma.user.create({ data: { email: `${token}@example.invalid`, role: 'editor' } })).id;
      otherId = (await prisma.user.create({ data: { email: `${token}-other@example.invalid`, role: 'admin' } })).id;
      organizationId = (await prisma.organization.create({ data: { name: token } })).id;
      const document = await prisma.document.create({ data: { userId, title: token, content: 'exact private content' } });
      documentId = document.id;
      const bytes = Buffer.from([0, 255, 17, 128, 10]);
      const entered = barrier(), release = barrier(); gates.push(release);
      const upload = storeFileBytes(bytes, 'exact.bin', 'application/octet-stream', userId, documentId, {
        writeBytes: async (path, content) => { files.push(path); await writeFile(path, content); entered.resolve(); await release.promise; },
      }); pending.push(upload);
      await entered.promise;
      const convert = prisma.$transaction(async tx => {
        await lockDocumentationAdministration(tx);
        await tx.$queryRaw`SELECT "id" FROM "Document" WHERE "id" = ${documentId} FOR UPDATE`;
        expect(await tx.attachment.count({ where: { documentId } })).toBe(1);
        return tx.document.update({ where: { id: documentId }, data: { ownershipKind: 'organization', organizationId, lifecycleState: 'draft' } });
      }); pending.push(convert);
      await waitForBlockedWriter();
      release.resolve();
      const attachment = await upload;
      await convert;
      expect(await readFile(attachment.filePath!)).toEqual(bytes);
      expect((await prisma.document.findUniqueOrThrow({ where: { id: documentId } })).content).toBe(document.content);
      const writer = vi.fn();
      await expect(storeFileBytes(bytes, 'late.bin', 'application/octet-stream', userId, documentId, { writeBytes: writer })).rejects.toMatchObject({ status: 404 });
      expect(writer).not.toHaveBeenCalled();

      await prisma.document.update({ where: { id: documentId }, data: { ownershipKind: 'personal', organizationId: null, lifecycleState: null } });
      const changeEntered = barrier(), changeRelease = barrier(); gates.push(changeRelease);
      const change = prisma.$transaction(async tx => {
        await lockDocumentationAdministration(tx);
        await tx.$queryRaw`SELECT "id" FROM "Document" WHERE "id" = ${documentId} FOR UPDATE`;
        await tx.document.update({ where: { id: documentId }, data: { userId: otherId } });
        changeEntered.resolve(); await changeRelease.promise;
      }); pending.push(change);
      await changeEntered.promise;
      const denied = storeFileBytes(bytes, 'lost-owner.bin', 'application/octet-stream', userId, documentId, { writeBytes: writer });
      const denial = expect(denied).rejects.toMatchObject({ status: 404 }); pending.push(denial);
      await waitForBlockedWriter(); changeRelease.resolve(); await change; await denial;
      expect(writer).not.toHaveBeenCalled();
      await prisma.user.update({ where: { id: userId }, data: { role: 'viewer' } });
      await expect(storeFileBytes(bytes, 'unassigned.bin', 'application/octet-stream', userId)).rejects.toMatchObject({ status: 403 });
      await prisma.document.update({ where: { id: documentId }, data: { deletedAt: new Date() } });
      await expect(storeFileBytes(bytes, 'trash.bin', 'application/octet-stream', otherId, documentId)).rejects.toMatchObject({ status: 404 });
      const restored = await storeFileBytes(Buffer.alloc(0), 'empty.bin', 'application/octet-stream', otherId, documentId, { restoreTrashed: true });
      files.push(restored.filePath!);
      expect(await readFile(restored.filePath!)).toEqual(Buffer.alloc(0));
    } finally {
      for (const gate of gates) gate.resolve();
      await Promise.allSettled(pending);
      if (documentId) { await prisma.attachment.deleteMany({ where: { documentId } }); await prisma.document.deleteMany({ where: { id: documentId } }); }
      if (organizationId) await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.user.deleteMany({ where: { id: { in: [userId, otherId].filter((id): id is string => !!id) } } });
      await Promise.allSettled(files.map(path => unlink(path)));
      await prisma.$disconnect();
    }
  }, 20_000);
