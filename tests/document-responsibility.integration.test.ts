import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
const state = vi.hoisted(() => ({ actor: null as { id: string; role: 'admin' | 'editor' | 'viewer' } | null }));
vi.mock('@/lib/auth', () => ({ auth: async () => state.actor }));
vi.mock('@/lib/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return { prisma: new PrismaClient() };
});
import { prisma } from '@/lib/prisma';
import { discoverDocumentMaintainers, reassignDocumentMaintainer } from '@/lib/document-responsibility';
import { changeDocumentationGrant } from '@/lib/documentation-grants';
import { GET, PUT } from '@/app/api/documents/[id]/responsibility/route';

it.skipIf(process.env.DOCUMENT_TEST_ISOLATED !== '1' || !process.env.DATABASE_URL)('reassigns responsibility without transferring ownership or disclosing other teams', async () => {
  const token = randomUUID();
  const ids: string[] = [];
  const orgs: string[] = [];
  let documentId: string | undefined;
  try {
    for (const role of ['admin', 'editor', 'viewer', 'admin'] as const) ids.push((await prisma.user.create({ data: { email: `${token}-${ids.length}@example.invalid`, role } })).id);
    for (let i = 0; i < 2; i++) orgs.push((await prisma.organization.create({ data: { name: `${token}-${i}` } })).id);
    for (const userId of ids.slice(0, 3)) await prisma.organizationMember.create({ data: { userId, organizationId: orgs[0] } });
    await prisma.organizationMember.create({ data: { userId: ids[3], organizationId: orgs[1] } });
    await changeDocumentationGrant(ids[0], orgs[0], ids[0], 'administrator');
    await changeDocumentationGrant(ids[0], orgs[0], ids[1], 'contributor');
    await changeDocumentationGrant(ids[0], orgs[0], ids[2], 'reader');
    const document = await prisma.document.create({ data: { title: 'Responsibility test', content: 'preserve exact body', userId: ids[0],
      organizationId: orgs[0], ownershipKind: 'organization', lifecycleState: 'draft', responsibleUserId: ids[0] } });
    documentId = document.id;
    const initial = document.updatedAt.toISOString();
    const routeContext = { params: Promise.resolve({ id: document.id }) };
    const routeRequest = () => new Request('http://localhost/responsibility', { method: 'PUT', body: JSON.stringify({ responsibleUserId: ids[1], expectedUpdatedAt: initial }) });
    expect((await PUT(routeRequest(), routeContext)).status).toBe(401);
    state.actor = { id: ids[2], role: 'viewer' };
    expect((await PUT(routeRequest(), routeContext)).status).toBe(403);
    state.actor = { id: ids[1], role: 'editor' };
    expect((await PUT(routeRequest(), routeContext)).status).toBe(404);
    state.actor = { id: ids[0], role: 'admin' };
    expect((await GET(routeRequest(), routeContext)).status).toBe(200);
    const choices = await discoverDocumentMaintainers(ids[0], document.id);
    expect(choices.items.map(item => item.id).sort()).toEqual(ids.slice(0, 2).sort());
    expect(choices.audienceChanges).toBe(false);
    for (const actorId of ids.slice(1)) {
      await expect(discoverDocumentMaintainers(actorId, document.id)).rejects.toMatchObject({ status: 404 });
      await expect(reassignDocumentMaintainer(actorId, document.id, ids[1], initial)).rejects.toMatchObject({ status: 404 });
    }
    await expect(reassignDocumentMaintainer(ids[0], document.id, ids[1])).rejects.toMatchObject({ status: 428 });
    for (const targetId of ids.slice(2)) await expect(reassignDocumentMaintainer(ids[0], document.id, targetId, initial)).rejects.toMatchObject({ status: 400 });
    const results = await Promise.allSettled([
      reassignDocumentMaintainer(ids[0], document.id, ids[1], initial),
      reassignDocumentMaintainer(ids[0], document.id, null, initial),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected').map(result => result.reason.status)).toEqual([409]);
    const saved = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    expect(saved).toMatchObject({ userId: document.userId, organizationId: document.organizationId, ownershipKind: document.ownershipKind,
      title: document.title, content: document.content, publishedSnapshotId: null, lifecycleState: 'draft', folderId: null });
    expect(await prisma.activityLog.count({ where: { resourceId: document.id, action: 'document.responsibility.change' } })).toBe(1);
    await expect(reassignDocumentMaintainer(ids[0], document.id, ids[1], initial)).rejects.toMatchObject({ status: 409 });
    const unchanged = await reassignDocumentMaintainer(ids[0], document.id, saved.responsibleUserId, saved.updatedAt.toISOString());
    expect(unchanged.changed).toBe(false);
    expect(unchanged.updatedAt).toEqual(saved.updatedAt);
    await changeDocumentationGrant(ids[0], orgs[0], ids[1], 'reader');
    await expect(reassignDocumentMaintainer(ids[0], document.id, ids[1], saved.updatedAt.toISOString())).rejects.toMatchObject({ status: 400 });
    const revision = await prisma.documentRevision.create({ data: { documentId: document.id, userId: ids[0], title: document.title, content: document.content, category: document.category, version: 1 } });
    const review = await prisma.documentReview.create({ data: { documentId: document.id, sourceRevisionId: revision.id, submittedById: ids[0], reviewerIds: [ids[0]] } });
    const inReview = await prisma.document.update({ where: { id: document.id }, data: { lifecycleState: 'in_review', responsibleUserId: ids[0] } });
    await reassignDocumentMaintainer(ids[0], document.id, null, inReview.updatedAt.toISOString());
    expect(await prisma.documentReview.findUniqueOrThrow({ where: { id: review.id } })).toMatchObject({ decision: 'withdrawn', decidedById: ids[0] });
    expect(await prisma.document.findUniqueOrThrow({ where: { id: document.id } })).toMatchObject({ lifecycleState: 'draft', content: document.content, userId: ids[0] });
    await prisma.document.update({ where: { id: document.id }, data: { isArchived: true, lifecycleState: 'archived' } });
    const archived = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    await reassignDocumentMaintainer(ids[0], document.id, null, archived.updatedAt.toISOString());
    expect(await prisma.document.findUniqueOrThrow({ where: { id: document.id } })).toMatchObject({ isArchived: true, lifecycleState: 'archived' });
    await prisma.document.update({ where: { id: document.id }, data: { deletedAt: new Date(), lifecycleState: 'trashed' } });
    await expect(discoverDocumentMaintainers(ids[0], document.id)).rejects.toMatchObject({ status: 404 });
  } finally {
    state.actor = null;
    if (documentId) await prisma.document.deleteMany({ where: { id: documentId } });
    await prisma.activityLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
}, 30_000);
