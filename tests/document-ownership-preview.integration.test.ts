import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
const state = vi.hoisted(() => ({ actor: null as { id: string; role: 'admin' | 'editor' | 'viewer' } | null }));
vi.mock('@/lib/auth', () => ({ auth: async () => state.actor }));
vi.mock('@/lib/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return { prisma: new PrismaClient() };
});
import { prisma } from '@/lib/prisma';
import { previewDocumentOwnership } from '@/lib/document-ownership-preview';
import { GET } from '@/app/api/documents/[id]/ownership/preview/route';
import { changeDocumentationGrant } from '@/lib/documentation-grants';

it.skipIf(process.env.DOCUMENT_TEST_ISOLATED !== '1' || !process.env.DATABASE_URL)('previews complete ownership exposure without sharing content or mutating state', async () => {
  const token = randomUUID();
  const ids: string[] = [];
  const orgs: string[] = [];
  let documentId: string | undefined;
  let folderId: string | undefined;
  try {
    for (const role of ['admin', 'editor', 'viewer', 'admin'] as const) ids.push((await prisma.user.create({ data: { email: `${token}-${ids.length}@example.invalid`, role } })).id);
    for (let i = 0; i < 2; i++) orgs.push((await prisma.organization.create({ data: { name: `${token}-${i}` } })).id);
    for (const userId of ids.slice(0, 3)) await prisma.organizationMember.create({ data: { userId, organizationId: orgs[1] } });
    await changeDocumentationGrant(ids[0], orgs[1], ids[0], 'administrator');
    await changeDocumentationGrant(ids[0], orgs[1], ids[1], 'contributor');
    await changeDocumentationGrant(ids[0], orgs[1], ids[2], 'reader');
    const document = await prisma.document.create({ data: { title: 'PRIVATE TITLE', content: 'PRIVATE CONTENT', userId: ids[0], organizationId: orgs[0], visibility: 'private' } });
    documentId = document.id;
    const version = document.updatedAt.toISOString();
    const context = { params: Promise.resolve({ id: document.id }) };
    const request = (suffix = '') => new Request(`http://localhost/ownership/preview?destinationOrganizationId=${orgs[1]}&expectedUpdatedAt=${encodeURIComponent(version)}${suffix}`);
    expect((await GET(request(), context)).status).toBe(401);
    state.actor = { id: ids[2], role: 'viewer' };
    expect((await GET(request(), context)).status).toBe(403);
    for (const actorId of ids.slice(1)) await expect(previewDocumentOwnership(actorId, document.id, orgs[1], version)).rejects.toMatchObject({ status: 404 });
    state.actor = { id: ids[0], role: 'admin' };
    await previewDocumentOwnership(ids[0], document.id, orgs[1], version);
    expect((await GET(request('&ownershipKind=organization'), context)).status).toBe(400);
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const preview = await response.json();
    expect(preview).toMatchObject({ kind: 'personal_to_team', requiresExplicitConsent: true, executionAvailable: true,
      source: { audiencePolicy: 'personal_owner' }, audience: { total: 3, workingCount: 2, publishedOnlyCount: 1 }, blockers: [],
      effects: { destinationState: 'draft' }, exposure: { historicalCopiesVisibleToMaintainers: true, readersRequireNewPublication: true } });
    expect(JSON.stringify(preview)).not.toContain('PRIVATE TITLE');
    expect(JSON.stringify(preview)).not.toContain('PRIVATE CONTENT');
    expect(await prisma.document.findUniqueOrThrow({ where: { id: document.id } })).toEqual(document);
    expect(await prisma.activityLog.count({ where: { resourceId: document.id } })).toBe(0);
    expect((await previewDocumentOwnership(ids[0], document.id, orgs[1], version)).fingerprint).toBe(preview.fingerprint);
    await expect(previewDocumentOwnership(ids[0], document.id, orgs[1])).rejects.toMatchObject({ status: 428 });
    await expect(previewDocumentOwnership(ids[0], document.id, orgs[1], '2020-01-01T00:00:00.000Z')).rejects.toMatchObject({ status: 409 });
    await expect(previewDocumentOwnership(ids[0], document.id, orgs[0], version)).rejects.toMatchObject({ status: 404 });
    for (const page of [-1, Infinity, 1.5]) await expect(previewDocumentOwnership(ids[0], document.id, orgs[1], version, page)).rejects.toMatchObject({ status: 400 });
    const foreign = await prisma.attachment.create({ data: { documentId: document.id, userId: ids[1], filename: 'PRIVATE FOREIGN FILE', mimeType: 'application/octet-stream', size: 3, data: 'YWJj' } });
    const blocked = await previewDocumentOwnership(ids[0], document.id, orgs[1], version);
    expect(blocked.blockers).toMatchObject([{ code: 'foreign_personal_attachments', count: 1 }]);
    expect(blocked.exposure.workingFiles).toBe(1);
    expect(blocked.fingerprint).not.toBe(preview.fingerprint);
    expect(JSON.stringify(blocked)).not.toContain('PRIVATE FOREIGN FILE');
    await prisma.attachment.delete({ where: { id: foreign.id } });
    const revision = await prisma.documentRevision.create({ data: { documentId: document.id, userId: ids[0], version: 1, title: document.title, content: document.content, category: document.category } });
    const review = await prisma.documentReview.create({ data: { documentId: document.id, sourceRevisionId: revision.id, submittedById: ids[0], reviewerIds: [ids[0]] } });
    const history = await previewDocumentOwnership(ids[0], document.id, orgs[1], version);
    expect(history.exposure).toMatchObject({ revisions: 1, reviews: 1 });
    expect(history.fingerprint).not.toBe(preview.fingerprint);
    await prisma.documentReview.update({ where: { id: review.id }, data: { decision: 'withdrawn', decidedById: ids[0], decidedAt: new Date() } });
    expect((await previewDocumentOwnership(ids[0], document.id, orgs[1], version)).fingerprint).not.toBe(history.fingerprint);
    await changeDocumentationGrant(ids[0], orgs[1], ids[1], 'reader');
    const changedAudience = await previewDocumentOwnership(ids[0], document.id, orgs[1], version);
    expect(changedAudience.audience.workingCount).toBe(1);
    expect(changedAudience.fingerprint).not.toBe(history.fingerprint);
    for (let i = 0; i < 26; i++) {
      const member = await prisma.user.create({ data: { email: `${token}-paged-${i}@example.invalid`, role: 'viewer' } }); ids.push(member.id);
      await prisma.organizationMember.create({ data: { organizationId: orgs[1], userId: member.id } });
      await changeDocumentationGrant(ids[0], orgs[1], member.id, 'reader');
    }
    const first = await previewDocumentOwnership(ids[0], document.id, orgs[1], version);
    const second = await previewDocumentOwnership(ids[0], document.id, orgs[1], version, 1);
    expect(first.audience.items).toHaveLength(25); expect(first.audience.hasMore).toBe(true);
    expect(second.audience.items).toHaveLength(4); expect(second.audience.hasMore).toBe(false);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(new Set([...first.audience.items, ...second.audience.items].map(item => item.id)).size).toBe(29);
    await prisma.organizationMember.create({ data: { organizationId: orgs[0], userId: ids[0] } });
    await changeDocumentationGrant(ids[0], orgs[0], ids[0], 'administrator');
    const publication = await prisma.documentPublication.create({ data: { documentId: document.id, sourceRevisionId: revision.id, title: 'OLD PRIVATE PUBLICATION', content: 'OLD PRIVATE CONTENT', category: 'general', tags: [], publisherId: ids[0] } });
    folderId = (await prisma.folder.create({ data: { userId: ids[0], organizationId: orgs[0], name: token } })).id;
    const team = await prisma.document.update({ where: { id: document.id }, data: { ownershipKind: 'organization', lifecycleState: 'draft', publishedSnapshotId: publication.id, folderId } });
    const transfer = await previewDocumentOwnership(ids[0], document.id, orgs[1], team.updatedAt.toISOString());
    expect(transfer).toMatchObject({ kind: 'team_to_team', exposure: { publications: 1 }, effects: { clearFolder: true, clearPublication: true, sourceTeamAccessRevoked: true } });
    expect(JSON.stringify(transfer)).not.toContain('OLD PRIVATE CONTENT');
    expect(await prisma.document.findUniqueOrThrow({ where: { id: document.id } })).toEqual(team);
    await prisma.organizationMember.delete({ where: { organizationId_userId: { organizationId: orgs[1], userId: ids[2] } } });
    expect((await previewDocumentOwnership(ids[0], document.id, orgs[1], team.updatedAt.toISOString())).audience.total).toBe(28);
    await expect(previewDocumentOwnership(ids[0], document.id, orgs[0], team.updatedAt.toISOString())).rejects.toMatchObject({ status: 400 });
    const archived = await prisma.document.update({ where: { id: document.id }, data: { isArchived: true, lifecycleState: 'archived' } });
    await expect(previewDocumentOwnership(ids[0], document.id, orgs[1], archived.updatedAt.toISOString())).rejects.toMatchObject({ status: 409 });
    await prisma.document.update({ where: { id: document.id }, data: { deletedAt: new Date(), lifecycleState: 'trashed' } });
    await expect(previewDocumentOwnership(ids[0], document.id, orgs[1], version)).rejects.toMatchObject({ status: 404 });
  } finally {
    state.actor = null;
    if (documentId) {
      await prisma.document.updateMany({ where: { id: documentId }, data: { publishedSnapshotId: null } });
      await prisma.documentPublication.deleteMany({ where: { documentId } });
      await prisma.document.deleteMany({ where: { id: documentId } });
    }
    if (folderId) await prisma.folder.delete({ where: { id: folderId } });
    await prisma.activityLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
}, 30_000);
