import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
const state = vi.hoisted(() => ({ actor: null as { id: string; role: 'admin' | 'editor' | 'viewer' } | null }));
vi.mock('@/lib/auth', () => ({ auth: async () => state.actor }));
vi.mock('@/lib/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return { prisma: new PrismaClient() };
});
import { prisma } from '@/lib/prisma';
import { listVisibleOrganizations, readVisibleOrganization } from '@/lib/organization-read';
import { discoverDocuments } from '@/lib/document-discovery';
import { GET as list } from '@/app/api/organizations/route';
import { GET as detail } from '@/app/api/organizations/[id]/route';

it.skipIf(process.env.DOCUMENT_TEST_ISOLATED !== '1' || !process.env.DATABASE_URL)('scopes organization metadata, counts and published document summaries under fresh authority', async () => {
  const token = randomUUID();
  const users: string[] = [];
  const orgs: string[] = [];
  const documents: string[] = [];
  try {
    for (const role of ['admin', 'editor', 'viewer', 'viewer', 'editor'] as const) {
      users.push((await prisma.user.create({ data: { email: `${token}-${users.length}@example.invalid`, role } })).id);
    }
    for (let i = 0; i < 2; i++) orgs.push((await prisma.organization.create({ data: { name: `${token}-${i}`, email: `${token}-${i}@example.invalid` } })).id);
    for (const userId of users.slice(1, 3)) {
      await prisma.organizationMember.create({ data: { userId, organizationId: orgs[0] } });
      await prisma.organizationDocumentationGrant.create({ data: { userId, organizationId: orgs[0], role: userId === users[1] ? 'contributor' : 'reader' } });
    }
    const makeDocument = async (title: string, data: Record<string, unknown> = {}) => {
      const document = await prisma.document.create({ data: { title, content: `body-${title}`, userId: users[0], organizationId: orgs[0], ...data } });
      documents.push(document.id);
      return document;
    };
    await makeDocument('private-other');
    await makeDocument('legacy-shared', { visibility: 'org' });
    await makeDocument('team-unpublished', { ownershipKind: 'organization', lifecycleState: 'draft', visibility: 'org' });
    const published = await makeDocument('working-secret-title', { ownershipKind: 'organization', lifecycleState: 'draft', visibility: 'org' });
    const revision = await prisma.documentRevision.create({ data: { documentId: published.id, userId: users[0], title: 'reader-title', content: 'reader-body', category: 'general', version: 1 } });
    const snapshot = await prisma.documentPublication.create({ data: { documentId: published.id, sourceRevisionId: revision.id, title: revision.title, content: revision.content, category: revision.category, tags: [], publisherId: users[0] } });
    await prisma.document.update({ where: { id: published.id }, data: { publishedSnapshotId: snapshot.id } });
    await makeDocument('archived-shared', { visibility: 'org', isArchived: true });
    await makeDocument('trashed-shared', { visibility: 'org', deletedAt: new Date() });
    await makeDocument('outside-shared', { organizationId: orgs[1], visibility: 'org' });
    for (const clientVisible of [true, false]) await prisma.password.create({ data: { name: `vault-${clientVisible}`, username: 'fixture', password: 'encrypted-fixture-secret', notes: 'private-notes', totpSecret: 'encrypted-totp', customFields: 'private-custom-fields', userId: users[0], organizationId: orgs[0], clientVisible } });
    await prisma.checklist.create({ data: { name: 'private-checklist', userId: users[0], organizationId: orgs[0] } });
    const context = { params: Promise.resolve({ id: orgs[0] }) };
    const request = new Request('http://localhost/organization');
    expect((await list()).status).toBe(401);
    expect((await detail(request, context)).status).toBe(401);
    for (const [index, role] of [[1, 'editor'], [2, 'viewer']] as const) {
      state.actor = { id: users[index], role };
      const response = await list();
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      const organizations = await response.json();
      expect(organizations.map((organization: { id: string }) => organization.id)).toEqual([orgs[0]]);
      const discovery = await discoverDocuments(users[index], { organizationId: orgs[0], page: 0, limit: 100 });
      expect(organizations[0]._count.documents).toBe(discovery.total);
      expect(organizations[0]._count.passwords).toBe(1);
      expect(organizations[0]._count.checklists).toBe(0);
      const result = await detail(request, context);
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.documents).toHaveLength(discovery.total);
      expect(body.documents.map((document: { title: string }) => document.title).sort()).toEqual(index === 2 ? ['legacy-shared', 'reader-title'] : ['legacy-shared', 'team-unpublished', 'working-secret-title']);
      for (const document of body.documents) expect(Object.keys(document).sort()).toEqual(['category', 'id', 'title', 'updatedAt']);
      expect(body.passwords).toHaveLength(1);
      expect(Object.keys(body.passwords[0]).sort()).toEqual(['id', 'name', 'updatedAt', 'username']);
      expect(JSON.stringify(body)).not.toContain('encrypted-fixture-secret');
      expect(body.checklists).toEqual([]);
      expect((await detail(request, { params: Promise.resolve({ id: orgs[1] }) })).status).toBe(404);
    }
    expect(await listVisibleOrganizations(users[3])).toEqual([]);
    await expect(readVisibleOrganization(users[3], orgs[0])).rejects.toMatchObject({ status: 404 });
    for (const userId of [users[0], users[4]]) {
      const organizations = await listVisibleOrganizations(userId);
      expect(organizations.map(organization => organization.id)).toEqual(expect.arrayContaining(orgs));
      const detail = await readVisibleOrganization(userId, orgs[0]);
      expect(detail.documents.map(document => document.id).sort()).toEqual((await discoverDocuments(userId, { organizationId: orgs[0], page: 0, limit: 100 })).items.map(document => document.id).sort());
      expect(detail.passwords).toHaveLength(userId === users[0] ? 2 : 0);
      expect(JSON.stringify(detail)).not.toContain('encrypted-totp');
    }
    await prisma.organizationDocumentationGrant.deleteMany({ where: { userId: users[2] } });
    expect((await readVisibleOrganization(users[2], orgs[0])).documents.map(document => document.title)).toEqual(['legacy-shared']);
    await prisma.organizationMember.deleteMany({ where: { userId: users[2] } });
    state.actor = { id: users[2], role: 'admin' };
    expect(await (await list()).json()).toEqual([]);
    expect((await detail(request, context)).status).toBe(404);
  } finally {
    state.actor = null;
    await prisma.document.updateMany({ where: { id: { in: documents } }, data: { publishedSnapshotId: null } });
    await prisma.documentPublication.deleteMany({ where: { documentId: { in: documents } } });
    await prisma.document.deleteMany({ where: { id: { in: documents } } });
    await prisma.password.deleteMany({ where: { userId: { in: users } } });
    await prisma.checklist.deleteMany({ where: { userId: { in: users } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  }
}, 30_000);
