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
    state.user = null;
    expect((await POST(new Request('http://localhost/api/ai/ask', { method: 'POST', body: '{}' }))).status).toBe(401);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await prisma.document.deleteMany({ where: { userId: { in: ids } } });
    await prisma.server.deleteMany({ where: { userId: { in: ids } } });
    await prisma.flexibleAsset.deleteMany({ where: { userId: { in: ids } } });
    await prisma.organizationMember.deleteMany({ where: { userId: { in: ids } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});
