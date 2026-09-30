import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { documentReadWhere } from '@/lib/document-access';
const auth = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ auth }));
import { POST } from '@/app/api/ai/ask/route';
const servers = vi.fn().mockResolvedValue([]);
const assets = vi.fn().mockResolvedValue([]);
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AI_API_KEY', 'synthetic-test-key');
  auth.mockResolvedValue({ id: 'viewer', role: 'viewer' });
  vi.mocked(prisma.organizationMember.findMany).mockResolvedValue([{ organizationId: 'allowed' }] as never);
  vi.mocked(prisma.document.findMany).mockResolvedValue([]);
  Object.assign(prisma, { server: { findMany: servers }, flexibleAsset: { findMany: assets } });
});
afterEach(() => vi.unstubAllEnvs());
const request = (body: unknown) => new Request('http://localhost/api/ai/ask', { method: 'POST', body: JSON.stringify(body) });
it('scopes all retrieval before context construction without a requested organization', async () => {
  expect((await POST(request({ question: 'network documentation' }))).status).toBe(200);
  for (const query of [servers, assets]) expect(query.mock.calls[0][0].where.organizationId).toEqual({ in: ['allowed'] });
  const where = vi.mocked(prisma.document.findMany).mock.calls[0][0]?.where;
  expect(where).toMatchObject({ AND: [documentReadWhere('viewer', { mode: 'limited', orgIds: ['allowed'] }), { isArchived: false }] });
});
it('uses impossible filters for users without memberships', async () => {
  vi.mocked(prisma.organizationMember.findMany).mockResolvedValue([]);
  await POST(request({ question: 'network documentation' }));
  for (const query of [servers, assets]) expect(query.mock.calls[0][0].where.organizationId).toEqual({ in: ['__none__'] });
});
it('rejects a foreign organization before retrieval', async () => {
  expect((await POST(request({ question: 'network', organizationId: 'foreign' }))).status).toBe(404);
  expect(prisma.document.findMany).not.toHaveBeenCalled();
  expect(servers).not.toHaveBeenCalled();
  expect(assets).not.toHaveBeenCalled();
});
it.each([{ question: 42 }, { question: 'network', organizationId: {} }])('rejects malformed input %j', async body => {
  expect((await POST(request(body))).status).toBe(400);
  expect(prisma.document.findMany).not.toHaveBeenCalled();
});
