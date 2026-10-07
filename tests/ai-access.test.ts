import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
const { auth, discover } = vi.hoisted(() => ({ auth: vi.fn(), discover: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/lib/document-discovery', () => ({ discoverDocuments: discover }));
import { POST } from '@/app/api/ai/ask/route';
const servers = vi.fn().mockResolvedValue([]);
const assets = vi.fn().mockResolvedValue([]);
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AI_API_KEY', 'synthetic-test-key');
  auth.mockResolvedValue({ id: 'viewer', role: 'viewer' });
  vi.mocked(prisma.organizationMember.findMany).mockResolvedValue([{ organizationId: 'allowed' }] as never);
  discover.mockResolvedValue({ items: [] });
  Object.assign(prisma, { server: { findMany: servers }, flexibleAsset: { findMany: assets } });
});
afterEach(() => vi.unstubAllEnvs());
const request = (body: unknown) => new Request('http://localhost/api/ai/ask', { method: 'POST', body: JSON.stringify(body) });
it('scopes all retrieval before context construction without a requested organization', async () => {
  expect((await POST(request({ question: 'network documentation' }))).status).toBe(200);
  for (const query of [servers, assets]) expect(query.mock.calls[0][0].where.organizationId).toEqual({ in: ['allowed'] });
  expect(discover).toHaveBeenCalledWith('viewer', { terms: ['network', 'documentation'], organizationId: undefined, excludeArchived: true, page: 0, limit: 6 });
});
it('uses impossible filters for users without memberships', async () => {
  vi.mocked(prisma.organizationMember.findMany).mockResolvedValue([]);
  await POST(request({ question: 'network documentation' }));
  for (const query of [servers, assets]) expect(query.mock.calls[0][0].where.organizationId).toEqual({ in: ['__none__'] });
});
it('rejects a foreign organization before retrieval', async () => {
  expect((await POST(request({ question: 'network', organizationId: 'foreign' }))).status).toBe(404);
  expect(discover).not.toHaveBeenCalled();
  expect(servers).not.toHaveBeenCalled();
  expect(assets).not.toHaveBeenCalled();
});
it.each([{ question: 42 }, { question: 'network', organizationId: {} }])('rejects malformed input %j', async body => {
  expect((await POST(request(body))).status).toBe(400);
  expect(discover).not.toHaveBeenCalled();
});
