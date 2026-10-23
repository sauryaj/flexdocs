import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
vi.mock('@/lib/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return { prisma: new PrismaClient() };
});
import { prisma } from '@/lib/prisma';
import { storeFileBytes, deleteFile, migrateBase64Attachments } from '@/lib/file-storage';
import { lockDocumentationAdministration } from '@/lib/documentation-grants';
import { readWorkingAttachmentBytes } from '@/lib/working-attachment-bytes';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { LocalImmutableFileStore } from '@/lib/immutable-file-store';

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
      if (documentId) { await prisma.attachment.deleteMany({ where: { documentId } }); await prisma.documentPublication.deleteMany({ where: { documentId } }); await prisma.document.deleteMany({ where: { id: documentId } }); }
      if (organizationId) await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.user.deleteMany({ where: { id: { in: [userId, otherId].filter((id): id is string => !!id) } } });
      await Promise.allSettled(files.map(path => unlink(path)));
      await prisma.$disconnect();
    }
  }, 20_000);

it.skipIf(process.env.DOCUMENT_TEST_ISOLATED !== '1' || !process.env.DATABASE_URL || !process.env.UPLOAD_DIR)(
  'locks personal removal and storage migration and preserves exact historical bytes', async () => {
    const token = randomUUID(), root = process.env.UPLOAD_DIR!;
    let userId: string | undefined, organizationId: string | undefined, documentId: string | undefined;
    const bytes = Buffer.from([0, 255, 128, 10, 20]);
    const key = createHash('sha256').update(bytes).digest('hex');
    const files = [join(root, 'publication-objects', key), join(root, 'publication-objects', createHash('sha256').update(Buffer.alloc(0)).digest('hex'))];
    const gates: ReturnType<typeof barrier>[] = [], pending: Promise<unknown>[] = [];
    try {
      userId = (await prisma.user.create({ data: { email: `${token}@example.invalid`, role: 'admin' } })).id;
      organizationId = (await prisma.organization.create({ data: { name: token } })).id;
      const document = await prisma.document.create({ data: { userId, title: token, content: 'preserved content' } }); documentId = document.id;
      const file = await prisma.attachment.create({ data: { documentId, userId, filename: 'history.bin', mimeType: 'application/octet-stream', size: bytes.length, data: bytes.toString('base64') } });
      const reference = await new LocalImmutableFileStore(root).put(bytes);
      const revision = await prisma.documentRevision.create({ data: { documentId, userId, title: token, content: document.content, category: document.category, version: 1 } });
      const publication = await prisma.documentPublication.create({ data: { documentId, sourceRevisionId: revision.id,
        title: token, content: document.content, category: document.category, publisherId: userId, tags: [],
        attachmentManifest: [{ attachmentId: file.id, filename: file.filename, mimeType: file.mimeType, ...reference }] } });
      const entered = barrier(), release = barrier(); gates.push(release);
      const remove = deleteFile(file.id, userId, { readBytes: async (record, path) => {
        entered.resolve(); await release.promise; return readWorkingAttachmentBytes(record, path);
      } }); pending.push(remove); await entered.promise;
      const change = prisma.$transaction(async tx => {
        await lockDocumentationAdministration(tx);
        await tx.$queryRaw`SELECT "id" FROM "Document" WHERE "id" = ${documentId} FOR UPDATE`;
        expect(await tx.attachment.count({ where: { id: file.id } })).toBe(0);
        await tx.document.update({ where: { id: documentId }, data: { ownershipKind: 'organization', organizationId, lifecycleState: 'draft' } });
      }); pending.push(change); await waitForBlockedWriter(); release.resolve();
      expect(await remove).toMatchObject({ bytesRetained: true, cleanupPending: true }); await change;
      expect(await readFile(files[0])).toEqual(bytes);
      expect((await prisma.documentPublication.findUniqueOrThrow({ where: { id: publication.id } })).attachmentManifest).toEqual(publication.attachmentManifest);
      expect(await new LocalImmutableFileStore(root).read(reference)).toEqual(bytes);
      expect(await prisma.activityLog.count({ where: { userId, action: 'attachment.delete', resourceId: file.id } })).toBe(1);
      const teamFile = await prisma.attachment.create({ data: { documentId, userId, filename: 'blocked.bin', mimeType: 'application/octet-stream', size: bytes.length, data: bytes.toString('base64') } });
      expect(await deleteFile(teamFile.id, userId)).toBeNull();
      expect(await prisma.attachment.findUnique({ where: { id: teamFile.id } })).not.toBeNull();
      await prisma.document.update({ where: { id: documentId }, data: { ownershipKind: 'personal', organizationId: null, lifecycleState: null } });
      const ownershipEntered = barrier(), ownershipRelease = barrier(); gates.push(ownershipRelease);
      const ownershipFirst = prisma.$transaction(async tx => {
        await lockDocumentationAdministration(tx);
        await tx.$queryRaw`SELECT "id" FROM "Document" WHERE "id" = ${documentId} FOR UPDATE`;
        await tx.document.update({ where: { id: documentId }, data: { ownershipKind: 'organization', organizationId, lifecycleState: 'draft' } });
        ownershipEntered.resolve(); await ownershipRelease.promise;
      }); pending.push(ownershipFirst); await ownershipEntered.promise;
      const queuedRemoval = deleteFile(teamFile.id, userId); pending.push(queuedRemoval);
      await waitForBlockedWriter(); ownershipRelease.resolve(); await ownershipFirst;
      expect(await queuedRemoval).toBeNull();
      expect((await prisma.attachment.findUniqueOrThrow({ where: { id: teamFile.id } })).data).toBe(bytes.toString('base64'));
      await prisma.document.update({ where: { id: documentId }, data: { ownershipKind: 'personal', organizationId: null, lifecycleState: null } });
      const empty = await prisma.attachment.create({ data: { documentId, userId, filename: 'empty', mimeType: 'application/octet-stream', size: 0, data: '' } });
      const broken = await prisma.attachment.create({ data: { documentId, userId, filename: 'broken', mimeType: 'application/octet-stream', size: 1, data: '!!!!' } });
      const migrationEntered = barrier(), migrationRelease = barrier(); gates.push(migrationRelease);
      const migration = migrateBase64Attachments({ attachmentIds: [teamFile.id], readBytes: async (record, path) => {
        migrationEntered.resolve(); await migrationRelease.promise; return readWorkingAttachmentBytes(record, path);
      } }); pending.push(migration); await migrationEntered.promise;
      const conversion = prisma.$transaction(async tx => {
        await lockDocumentationAdministration(tx);
        await tx.$queryRaw`SELECT "id" FROM "Document" WHERE "id" = ${documentId} FOR UPDATE`;
        expect((await tx.attachment.findUniqueOrThrow({ where: { id: teamFile.id } })).storageType).toBe('filesystem');
        await tx.document.update({ where: { id: documentId }, data: { ownershipKind: 'organization', organizationId, lifecycleState: 'draft' } });
      }); pending.push(conversion); await waitForBlockedWriter(); migrationRelease.resolve();
      expect(await migration).toMatchObject({ migrated: 1, failed: 0 }); await conversion;
      const stored = await prisma.attachment.findUniqueOrThrow({ where: { id: teamFile.id } });
      expect(stored.data).toBeNull(); expect(await readWorkingAttachmentBytes(stored, root)).toEqual(bytes);
      expect(await migrateBase64Attachments({ attachmentIds: [empty.id, broken.id] })).toMatchObject({ total: 2, migrated: 1, failed: 1 });
      expect(await readWorkingAttachmentBytes(await prisma.attachment.findUniqueOrThrow({ where: { id: empty.id } }), root)).toEqual(Buffer.alloc(0));
      expect((await prisma.attachment.findUniqueOrThrow({ where: { id: broken.id } })).data).toBe('!!!!');
      expect((await prisma.document.findUniqueOrThrow({ where: { id: documentId } })).content).toBe(document.content);
    } finally {
      for (const gate of gates) gate.resolve(); await Promise.allSettled(pending);
      if (documentId) { await prisma.attachment.deleteMany({ where: { documentId } }); await prisma.documentPublication.deleteMany({ where: { documentId } }); await prisma.document.deleteMany({ where: { id: documentId } }); }
      if (userId) await prisma.activityLog.deleteMany({ where: { userId } });
      if (organizationId) await prisma.organization.deleteMany({ where: { id: organizationId } });
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
      // The empty immutable object may be shared with other fixtures. Leave content-addressed objects for reference-aware cleanup.
      await prisma.$disconnect();
    }
  }, 20_000);
