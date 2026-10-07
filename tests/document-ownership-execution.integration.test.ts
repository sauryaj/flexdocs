import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
vi.mock('@/lib/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client'); return { prisma: new PrismaClient() };
});
import { prisma } from '@/lib/prisma';
import { changeDocumentationGrant } from '@/lib/documentation-grants';
import { previewDocumentOwnership } from '@/lib/document-ownership-preview';
import { prepareDocumentOwnershipRequest, cancelDocumentOwnershipRequest } from '@/lib/document-ownership-requests';
import { confirmDocumentOwnershipRequest } from '@/lib/document-ownership-execution';
import { resolveDocumentCapabilities } from '@/lib/document-capability-service';
import { LocalImmutableFileStore } from '@/lib/immutable-file-store';
import { readWorkingAttachmentBytes } from '@/lib/working-attachment-bytes';

it.skipIf(process.env.DOCUMENT_TEST_ISOLATED !== '1' || !process.env.DATABASE_URL)(
  'requires current explicit consent, preserves history/files and atomically replays ownership conversion', async () => {
    const token = randomUUID(), root = await mkdtemp(join(tmpdir(), 'flexdocs-convert-'));
    const users: string[] = [], orgs: string[] = [], docs: string[] = [];
    try {
      for (const role of ['admin', 'editor', 'viewer', 'editor', 'editor'] as const) users.push((await prisma.user.create({ data: { email: `${token}-${users.length}@example.invalid`, role } })).id);
      for (let i = 0; i < 2; i++) orgs.push((await prisma.organization.create({ data: { name: `${token}-${i}` } })).id);
      for (const organizationId of orgs) {
        for (const userId of users.slice(0, organizationId === orgs[0] ? 5 : 4)) await prisma.organizationMember.create({ data: { organizationId, userId } });
        await changeDocumentationGrant(users[0], organizationId, users[0], 'administrator');
        await changeDocumentationGrant(users[0], organizationId, users[1], 'administrator');
        await changeDocumentationGrant(users[0], organizationId, users[2], 'reader');
        await changeDocumentationGrant(users[0], organizationId, users[3], 'contributor');
      }
      await changeDocumentationGrant(users[0], orgs[0], users[4], 'contributor');
      const document = await prisma.document.create({ data: { userId: users[1], title: token, content: '# Exact private Markdown\n', organizationId: orgs[0], lifecycleState: 'in_review' } }); docs.push(document.id);
      const bytes = Buffer.from([0, 255, 128, 17]);
      const attachment = await prisma.attachment.create({ data: { documentId: document.id, userId: users[1], filename: 'private.bin', mimeType: 'application/octet-stream', size: bytes.length, data: bytes.toString('base64') } });
      const reference = await new LocalImmutableFileStore(root).put(bytes);
      const revision = await prisma.documentRevision.create({ data: { documentId: document.id, userId: users[1], title: document.title, content: document.content, category: document.category, version: 1 } });
      const manifest = [{ attachmentId: attachment.id, filename: attachment.filename, mimeType: attachment.mimeType, ...reference }];
      const publication = await prisma.documentPublication.create({ data: { documentId: document.id, sourceRevisionId: revision.id, title: document.title,
        content: document.content, category: document.category, publisherId: users[1], tags: [], attachmentManifest: manifest } });
      const review = await prisma.documentReview.create({ data: { documentId: document.id, sourceRevisionId: revision.id, submittedById: users[1], reviewerIds: [users[1]], tags: [], attachmentManifest: manifest } });
      await prisma.document.update({ where: { id: document.id }, data: { publishedSnapshotId: publication.id, updatedAt: document.updatedAt } });
      async function prepare(id: string, destination: string) {
        const source = await prisma.document.findUniqueOrThrow({ where: { id } });
        const preview = await previewDocumentOwnership(users[1], id, destination, source.updatedAt.toISOString());
        const request = await prepareDocumentOwnershipRequest(users[1], id, { key: randomUUID(), destinationOrganizationId: destination,
          expectedUpdatedAt: preview.updatedAt, previewFingerprint: preview.fingerprint });
        const confirmation = { expectedUpdatedAt: preview.updatedAt, previewFingerprint: preview.fingerprint, acknowledgeWorkingHistoryAndFilesExposure: true };
        return { request: request.request, confirmation };
      }
      const initial = await prepare(document.id, orgs[0]);
      await expect(confirmDocumentOwnershipRequest(users[1], initial.request.id, { ...initial.confirmation, acknowledgeWorkingHistoryAndFilesExposure: false }, { uploadRoot: root })).rejects.toMatchObject({ status: 400 });
      await expect(confirmDocumentOwnershipRequest(users[0], initial.request.id, initial.confirmation, { uploadRoot: root })).rejects.toMatchObject({ status: 404 });
      await expect(confirmDocumentOwnershipRequest(users[2], initial.request.id, initial.confirmation, { uploadRoot: root })).rejects.toMatchObject({ status: 403 });
      await changeDocumentationGrant(users[0], orgs[0], users[3], 'reviewer');
      await expect(confirmDocumentOwnershipRequest(users[1], initial.request.id, initial.confirmation, { uploadRoot: root })).rejects.toMatchObject({ status: 409 });
      expect((await prisma.document.findUniqueOrThrow({ where: { id: document.id } })).ownershipKind).toBe('personal');
      const current = await prepare(document.id, orgs[0]);
      const results = await Promise.all([1, 2].map(() => confirmDocumentOwnershipRequest(users[1], current.request.id, current.confirmation, { uploadRoot: root })));
      expect(results.map(item => item.replayed).sort()).toEqual([false, true]);
      const converted = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
      expect(converted).toMatchObject({ ownershipKind: 'organization', organizationId: orgs[0], lifecycleState: 'draft', publishedSnapshotId: null,
        folderId: null, userId: users[1], responsibleUserId: users[1], content: document.content, title: document.title });
      expect(await prisma.documentRevision.findUnique({ where: { id: revision.id } })).toEqual(revision);
      expect(await prisma.documentPublication.findUnique({ where: { id: publication.id } })).toEqual(publication);
      expect((await prisma.documentReview.findUniqueOrThrow({ where: { id: review.id } })).decision).toBe('withdrawn');
      expect(await readWorkingAttachmentBytes(await prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } }), root)).toEqual(bytes);
      expect(await new LocalImmutableFileStore(root).read(reference)).toEqual(bytes);
      const reader = await resolveDocumentCapabilities(converted, { id: users[2], role: 'viewer' });
      expect(reader.readWorking).toBe(false); expect(reader.readPublished).toBe(false);
      expect(results[0].request).toMatchObject({ status: 'completed', consentedAt: expect.any(String), completedAt: expect.any(String) });
      expect(await prisma.activityLog.count({ where: { resourceId: document.id, action: 'document.ownership.complete' } })).toBe(1);
      await expect(cancelDocumentOwnershipRequest(users[1], current.request.id)).rejects.toMatchObject({ status: 409 });
      const transfer = await prepare(document.id, orgs[1]);
      await changeDocumentationGrant(users[0], orgs[1], users[1], 'contributor');
      await expect(confirmDocumentOwnershipRequest(users[1], transfer.request.id, transfer.confirmation, { uploadRoot: root })).rejects.toMatchObject({ status: 404 });
      await changeDocumentationGrant(users[0], orgs[1], users[1], 'administrator');
      const sourceRevoked = await prepare(document.id, orgs[1]);
      await changeDocumentationGrant(users[0], orgs[0], users[1], 'contributor');
      await expect(confirmDocumentOwnershipRequest(users[1], sourceRevoked.request.id, sourceRevoked.confirmation, { uploadRoot: root })).rejects.toMatchObject({ status: 404 });
      await changeDocumentationGrant(users[0], orgs[0], users[1], 'administrator');
      const transferCurrent = await prepare(document.id, orgs[1]);
      await confirmDocumentOwnershipRequest(users[1], transferCurrent.request.id, transferCurrent.confirmation, { uploadRoot: root });
      const transferred = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
      expect(transferred.organizationId).toBe(orgs[1]);
      expect((await resolveDocumentCapabilities(transferred, { id: users[4], role: 'editor' })).readWorking).toBe(false);
      await changeDocumentationGrant(users[0], orgs[0], users[1], 'reader');
      expect((await confirmDocumentOwnershipRequest(users[1], current.request.id, current.confirmation, { uploadRoot: root })).replayed).toBe(true);

      const brokenDoc = await prisma.document.create({ data: { userId: users[1], title: 'missing historical bytes', content: 'unchanged' } }); docs.push(brokenDoc.id);
      const brokenRevision = await prisma.documentRevision.create({ data: { documentId: brokenDoc.id, userId: users[1], title: brokenDoc.title, content: brokenDoc.content, category: brokenDoc.category, version: 1 } });
      await prisma.documentPublication.create({ data: { documentId: brokenDoc.id, sourceRevisionId: brokenRevision.id, title: brokenDoc.title, content: brokenDoc.content,
        category: brokenDoc.category, publisherId: users[1], tags: [], attachmentManifest: [{ ...manifest[0], key: 'f'.repeat(64), sha256: 'f'.repeat(64) }] } });
      const broken = await prepare(brokenDoc.id, orgs[1]);
      await expect(confirmDocumentOwnershipRequest(users[1], broken.request.id, broken.confirmation, { uploadRoot: root })).rejects.toMatchObject({ status: 503 });
      expect(await prisma.document.findUniqueOrThrow({ where: { id: brokenDoc.id } })).toEqual(brokenDoc);
      expect((await prisma.documentOwnershipRequest.findUniqueOrThrow({ where: { id: broken.request.id } })).status).toBe('pending');
      vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(Date.now() + 31 * 60 * 1000));
      await expect(confirmDocumentOwnershipRequest(users[1], broken.request.id, broken.confirmation, { uploadRoot: root })).rejects.toMatchObject({ status: 409 });
      vi.useRealTimers();
      await cancelDocumentOwnershipRequest(users[1], broken.request.id);
      await expect(confirmDocumentOwnershipRequest(users[1], broken.request.id, broken.confirmation, { uploadRoot: root })).rejects.toMatchObject({ status: 409 });
      const stale = await prepare(brokenDoc.id, orgs[1]);
      await prisma.document.update({ where: { id: brokenDoc.id }, data: { content: 'new private edit' } });
      await expect(confirmDocumentOwnershipRequest(users[1], stale.request.id, stale.confirmation, { uploadRoot: root })).rejects.toMatchObject({ status: 409 });
      const rollbackDoc = await prisma.document.create({ data: { userId: users[1], title: 'working rollback', content: 'private' } }); docs.push(rollbackDoc.id);
      await prisma.attachment.create({ data: { id: `${token}-a`, documentId: rollbackDoc.id, userId: users[1], filename: 'valid.bin', mimeType: 'application/octet-stream', size: bytes.length, data: bytes.toString('base64') } });
      await prisma.attachment.create({ data: { id: `${token}-b`, documentId: rollbackDoc.id, userId: users[1], filename: 'missing.bin', mimeType: 'application/octet-stream', size: bytes.length, storageType: 'filesystem', filePath: join(root, 'missing') } });
      const beforeFiles = await prisma.attachment.findMany({ where: { documentId: rollbackDoc.id }, orderBy: { id: 'asc' } });
      const rollback = await prepare(rollbackDoc.id, orgs[1]);
      await expect(confirmDocumentOwnershipRequest(users[1], rollback.request.id, rollback.confirmation, { uploadRoot: root })).rejects.toMatchObject({ status: 503 });
      expect(await prisma.attachment.findMany({ where: { documentId: rollbackDoc.id }, orderBy: { id: 'asc' } })).toEqual(beforeFiles);
      expect(await prisma.document.findUniqueOrThrow({ where: { id: rollbackDoc.id } })).toEqual(rollbackDoc);
      const simultaneousDoc = await prisma.document.create({ data: { userId: users[1], title: 'two independent requests', content: 'private' } }); docs.push(simultaneousDoc.id);
      const first = await prepare(simultaneousDoc.id, orgs[1]), second = await prepare(simultaneousDoc.id, orgs[1]);
      const competing = await Promise.allSettled([first, second].map(item => confirmDocumentOwnershipRequest(users[1], item.request.id, item.confirmation, { uploadRoot: root })));
      expect(competing.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(competing.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
    } finally {
      vi.useRealTimers();
      await prisma.documentOwnershipRequest.deleteMany({ where: { actorId: { in: users } } });
      await prisma.document.updateMany({ where: { id: { in: docs } }, data: { publishedSnapshotId: null } });
      await prisma.documentReview.deleteMany({ where: { documentId: { in: docs } } });
      await prisma.documentPublication.deleteMany({ where: { documentId: { in: docs } } });
      await prisma.attachment.deleteMany({ where: { documentId: { in: docs } } });
      await prisma.document.deleteMany({ where: { id: { in: docs } } });
      await prisma.activityLog.deleteMany({ where: { userId: { in: users } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      await prisma.$disconnect(); await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
