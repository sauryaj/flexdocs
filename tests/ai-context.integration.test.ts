import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
const state = vi.hoisted(() => ({ user: null as { id: string; role: 'admin' | 'editor' | 'viewer' } | null }));
vi.mock('@/lib/auth', () => ({ auth: async () => state.user }));
vi.mock('@/lib/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return { prisma: new PrismaClient() };
});
import { prisma } from '@/lib/prisma';
import { POST } from '@/app/api/ai/ask/route';
import { resolveDocumentCapabilities } from '@/lib/document-capability-service';
import { changeDocumentationGrant, removeOrganizationMember } from '@/lib/documentation-grants';
import { administerAccount } from '@/lib/account-administration';

it.skipIf(process.env.DOCUMENT_TEST_ISOLATED !== '1' || !process.env.DATABASE_URL)('keeps foreign and private data out of actual provider context', async () => {
  const token = randomUUID();
  const ids: string[] = [];
  const orgs: string[] = [];
  vi.stubEnv('AI_API_KEY', 'synthetic');
  let context = '';
  const provider = vi.fn(async (_url: unknown, options: RequestInit | undefined) => {
    context = JSON.parse(String(options?.body)).messages[0].content;
    return Response.json({ choices: [{ message: { content: 'Synthetic answer' } }] });
  });
  vi.stubGlobal('fetch', provider);
  try {
    for (const role of ['admin', 'editor', 'viewer'] as const) ids.push((await prisma.user.create({ data: { email: `${token}-${role}@example.invalid`, role } })).id);
    for (const name of ['allowed', 'foreign']) orgs.push((await prisma.organization.create({ data: { name: `${token}-${name}` } })).id);
    for (const userId of ids) await prisma.organizationMember.create({ data: { userId, organizationId: orgs[0] } });
    for (const [index, organizationId] of orgs.entries()) {
      const marker = index ? 'FOREIGN_MARKER' : 'ALLOWED_MARKER';
      await prisma.server.create({ data: { name: marker, userId: ids[0], organizationId } });
      await prisma.flexibleAsset.create({ data: { name: marker, assetType: 'test', userId: ids[0], organizationId } });
      await prisma.document.create({ data: { title: token, content: marker, userId: ids[0], organizationId, visibility: 'org' } });
    }
    await prisma.document.create({ data: { title: token, content: 'PRIVATE_MARKER', userId: ids[0], organizationId: orgs[0], visibility: 'private' } });
    for (const [index, role] of (['admin', 'editor', 'viewer'] as const).entries()) {
      state.user = { id: ids[index], role };
      const response = await POST(new Request('http://localhost/api/ai/ask', { method: 'POST', body: JSON.stringify({ question: token, organizationId: orgs[0] }) }));
      expect(response.status).toBe(200);
      expect(context).toContain('ALLOWED_MARKER');
      expect(context).not.toContain('FOREIGN_MARKER');
      if (role !== 'admin') expect(context).not.toContain('PRIVATE_MARKER');
      if (role !== 'admin') {
        await POST(new Request('http://localhost/api/ai/ask', { method: 'POST', body: JSON.stringify({ question: token }) }));
        expect(context).not.toContain('FOREIGN_MARKER');
      }
    }
    const teamDocument = { userId: ids[0], ownershipKind: 'organization' as const, organizationId: orgs[0], isArchived: false, deletedAt: null };
    await prisma.organizationDocumentationGrant.create({ data: { userId: ids[1], organizationId: orgs[0], role: 'contributor' } });
    expect((await resolveDocumentCapabilities(teamDocument, { id: ids[1], role: 'editor' })).edit).toBe(true);
    await prisma.organizationMember.deleteMany({ where: { userId: ids[1], organizationId: orgs[0] } });
    expect((await resolveDocumentCapabilities(teamDocument, { id: ids[1], role: 'editor' })).edit).toBe(false);
    await expect(changeDocumentationGrant(ids[2], orgs[0], ids[2], 'reader')).rejects.toMatchObject({ status: 403 });
    await expect(changeDocumentationGrant(ids[0], orgs[0], ids[2], 'contributor')).rejects.toMatchObject({ status: 400 });
    await expect(changeDocumentationGrant(ids[0], orgs[0], ids[1], 'administrator')).rejects.toMatchObject({ status: 400 });
    await changeDocumentationGrant(ids[0], orgs[0], ids[0], 'administrator');
    await expect(changeDocumentationGrant(ids[0], orgs[0], ids[0], null)).rejects.toMatchObject({ status: 409 });
    await prisma.organizationMember.create({ data: { userId: ids[1], organizationId: orgs[0] } });
    await changeDocumentationGrant(ids[0], orgs[0], ids[1], 'administrator');
    const removals = await Promise.allSettled([
      changeDocumentationGrant(ids[0], orgs[0], ids[0], null),
      changeDocumentationGrant(ids[0], orgs[0], ids[1], null),
    ]);
    expect(removals.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(removals.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(await prisma.organizationDocumentationGrant.count({ where: { organizationId: orgs[0], role: 'administrator' } })).toBe(1);
    expect(await prisma.activityLog.count({ where: { resourceId: orgs[0], action: 'documentation.grant.change' } })).toBe(3);
    const remainingAdmin = await prisma.organizationDocumentationGrant.findFirstOrThrow({ where: { organizationId: orgs[0], role: 'administrator' } });
    await expect(administerAccount(ids[0], remainingAdmin.userId, 'viewer')).rejects.toMatchObject({ status: 409 });
    await expect(administerAccount(ids[0], remainingAdmin.userId, null)).rejects.toMatchObject({ status: remainingAdmin.userId === ids[0] ? 400 : 409 });
    await expect(administerAccount(ids[2], ids[1], 'viewer')).rejects.toMatchObject({ status: 403 });
    await expect(administerAccount(ids[0], ids[0], null)).rejects.toMatchObject({ status: 400 });
    const ownedDocument = await prisma.document.create({ data: { userId: ids[2], title: 'Preserve account-owned Trash', deletedAt: new Date() } });
    await expect(administerAccount(ids[0], ids[2], null)).rejects.toMatchObject({ status: 409 });
    expect(await prisma.document.findUnique({ where: { id: ownedDocument.id } })).not.toBeNull();
    await prisma.document.delete({ where: { id: ownedDocument.id } });
    expect((await administerAccount(ids[0], ids[2], 'editor'))?.role).toBe('editor');
    expect((await administerAccount(ids[0], ids[2], 'viewer'))?.role).toBe('viewer');
    const protectedMember = await prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: orgs[0], userId: remainingAdmin.userId } } });
    await expect(removeOrganizationMember(ids[0], protectedMember.id)).rejects.toMatchObject({ status: 409 });
    await changeDocumentationGrant(ids[0], orgs[0], ids[2], 'reader');
    const readerMembership = await prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: orgs[0], userId: ids[2] } } });
    await expect(removeOrganizationMember(ids[2], readerMembership.id)).rejects.toMatchObject({ status: 403 });
    await removeOrganizationMember(ids[0], readerMembership.id);
    expect(await prisma.organizationDocumentationGrant.count({ where: { userId: ids[2] } })).toBe(0);
    expect(await prisma.activityLog.count({ where: { resourceId: orgs[0], action: 'organization.member.remove' } })).toBe(1);
    await prisma.organizationMember.deleteMany({ where: { userId: ids[2] } });
    state.user = { id: ids[2], role: 'viewer' };
    const callsBefore = provider.mock.calls.length;
    expect((await POST(new Request('http://localhost/api/ai/ask', { method: 'POST', body: JSON.stringify({ question: token }) }))).status).toBe(200);
    expect(provider.mock.calls.length).toBe(callsBefore);
    state.user = null;
    expect((await POST(new Request('http://localhost/api/ai/ask', { method: 'POST', body: '{}' }))).status).toBe(401);
    const draft = await prisma.document.create({ data: { userId: ids[0], title: 'Publication source', content: 'Frozen content', lifecycleState: 'draft' } });
    const revision = await prisma.documentRevision.create({ data: { documentId: draft.id, userId: ids[0], title: draft.title, content: draft.content, category: draft.category, version: 1 } });
    const snapshot = await prisma.documentPublication.create({ data: { documentId: draft.id, sourceRevisionId: revision.id, title: draft.title, content: draft.content, category: draft.category, tags: [], publisherId: ids[0] } });
    await expect(prisma.documentPublication.update({ where: { id: snapshot.id }, data: { content: 'Overwrite' } })).rejects.toThrow();
    await expect(prisma.document.update({ where: { id: draft.id }, data: { lifecycleState: 'trashed' } })).rejects.toThrow();
    const other = await prisma.document.findFirstOrThrow({ where: { userId: ids[0], id: { not: draft.id } } });
    await expect(prisma.document.update({ where: { id: other.id }, data: { publishedSnapshotId: snapshot.id } })).rejects.toThrow();
    await expect(prisma.documentPublication.create({ data: { documentId: other.id, sourceRevisionId: revision.id, title: 'Wrong revision', content: '', category: 'general', tags: [], publisherId: ids[0] } })).rejects.toThrow();
    await prisma.document.update({ where: { id: draft.id }, data: { publishedSnapshotId: snapshot.id, lifecycleState: 'published' } });
    await prisma.document.update({ where: { id: draft.id }, data: { content: 'New working content' } });
    expect((await prisma.documentPublication.findUniqueOrThrow({ where: { id: snapshot.id } })).content).toBe('Frozen content');
    await expect(prisma.documentReview.create({ data: { documentId: draft.id, sourceRevisionId: revision.id, submittedById: ids[0], reviewerIds: [], decision: 'approved' } })).rejects.toThrow();
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await prisma.document.updateMany({ where: { userId: { in: ids } }, data: { publishedSnapshotId: null } });
    await prisma.documentPublication.deleteMany({ where: { publisherId: { in: ids } } });
    await prisma.document.deleteMany({ where: { userId: { in: ids } } });
    await prisma.server.deleteMany({ where: { userId: { in: ids } } });
    await prisma.flexibleAsset.deleteMany({ where: { userId: { in: ids } } });
    await prisma.organizationMember.deleteMany({ where: { userId: { in: ids } } });
    await prisma.organizationDocumentationGrant.deleteMany({ where: { userId: { in: ids } } });
    await prisma.activityLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});
