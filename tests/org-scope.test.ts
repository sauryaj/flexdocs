import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    organizationMember: { findMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { getOrgScope, scopeOrgWhere } from '@/lib/org-scope';

const mockedFindMany = vi.mocked(prisma.organizationMember.findMany, true);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getOrgScope', () => {
  it('admins always see everything, even with memberships', async () => {
    mockedFindMany.mockResolvedValue([{ organizationId: 'a' }] as never);
    const scope = await getOrgScope('u1', 'admin');
    expect(scope).toEqual({ mode: 'all' });
    expect(mockedFindMany).not.toHaveBeenCalled();
  });

  it('membership always wins over staff-wide access (editors included)', async () => {
    mockedFindMany.mockResolvedValue([
      { organizationId: 'org1' },
      { organizationId: 'org2' },
    ] as never);
    const scope = await getOrgScope('u1', 'editor');
    expect(scope).toEqual({ mode: 'limited', orgIds: ['org1', 'org2'] });
  });

  it('editor without memberships keeps legacy staff-wide access', async () => {
    mockedFindMany.mockResolvedValue([] as never);
    expect(await getOrgScope('u1', 'editor')).toEqual({ mode: 'all' });
  });

  it('viewer without memberships sees nothing shared', async () => {
    mockedFindMany.mockResolvedValue([] as never);
    const scope = await getOrgScope('u1', 'viewer');
    expect(scope).toEqual({ mode: 'limited', orgIds: [] });
  });

  it('viewer with memberships is limited to them', async () => {
    mockedFindMany.mockResolvedValue([{ organizationId: 'org9' }] as never);
    expect(await getOrgScope('u1', 'viewer')).toEqual({ mode: 'limited', orgIds: ['org9'] });
  });

  it('missing role is treated as non-staff', async () => {
    mockedFindMany.mockResolvedValue([] as never);
    expect(await getOrgScope('u1', undefined)).toEqual({ mode: 'limited', orgIds: [] });
  });
});

describe('scopeOrgWhere', () => {
  it('all-scope with a requested org filters to exactly that org', () => {
    expect(scopeOrgWhere({ mode: 'all' }, 'orgA')).toEqual({ organizationId: 'orgA' });
  });

  it('all-scope without request adds no constraint', () => {
    expect(scopeOrgWhere({ mode: 'all' })).toEqual({});
  });

  it('limited-scope intersects the request with memberships', () => {
    const scope = { mode: 'limited' as const, orgIds: ['a', 'b'] };
    expect(scopeOrgWhere(scope, 'a')).toEqual({ organizationId: { in: ['a'] } });
  });

  it('limited-scope requesting a foreign org yields an impossible filter', () => {
    const scope = { mode: 'limited' as const, orgIds: ['a'] };
    const w = scopeOrgWhere(scope, 'hacker-org');
    expect(w.organizationId).toEqual({ in: ['__none__'] });
  });

  it('limited-scope without request constrains to all member orgs', () => {
    const scope = { mode: 'limited' as const, orgIds: ['a', 'b'] };
    expect(scopeOrgWhere(scope)).toEqual({ organizationId: { in: ['a', 'b'] } });
  });

  it('empty membership list yields an impossible filter (no data leaks)', () => {
    const w = scopeOrgWhere({ mode: 'limited', orgIds: [] });
    expect(w.organizationId).toEqual({ in: ['__none__'] });
  });
});
