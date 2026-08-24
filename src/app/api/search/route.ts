import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { getOrgScope, scopeOrgWhere } from '@/lib/org-scope';

const MAX_PER_TYPE = 5;

interface SearchItem {
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  const organizationId = searchParams.get('organizationId') || undefined;

  if (!q) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }

  const scope = await getOrgScope(user.id, user.role);
  const orgWhere = scopeOrgWhere(scope, organizationId);
  const isStaff = scope.mode === 'all';
  const contains: Prisma.StringFilter = { contains: q, mode: 'insensitive' };
  const lc = q.toLowerCase();

  const [
    documents, passwords, domains, assets, checklists, servers, tickets, organizations,
  ] = await Promise.all([
    // Documents: staff search their own vault; clients search org-visible docs
    prisma.document.findMany({
      where: isStaff
        ? { userId: user.id, ...(organizationId ? { organizationId } : {}), OR: [{ title: contains }, { content: contains }] }
        : { ...orgWhere, isArchived: false, visibility: 'org', OR: [{ title: contains }, { content: contains }] },
      take: MAX_PER_TYPE * 4,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, content: true, updatedAt: true },
    }),
    // Passwords mirror the vault list scoping
    prisma.password.findMany({
      where: isStaff
        ? { userId: user.id, ...(organizationId ? { organizationId } : {}), OR: [{ name: contains }, { username: contains }, { url: contains }] }
        : { ...orgWhere, OR: [{ name: contains }, { username: contains }] },
      take: MAX_PER_TYPE * 2,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, username: true, url: true, updatedAt: true },
    }),
    prisma.domain.findMany({
      where: { ...orgWhere, OR: [{ name: contains }, { registrar: contains }] },
      take: MAX_PER_TYPE * 2,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, registrar: true, updatedAt: true },
    }),
    prisma.flexibleAsset.findMany({
      where: { ...orgWhere, OR: [{ name: contains }, { assetType: contains }] },
      take: MAX_PER_TYPE * 2,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, assetType: true, updatedAt: true },
    }),
    prisma.checklist.findMany({
      where: isStaff
        ? { userId: user.id, ...(organizationId ? { organizationId } : {}), OR: [{ name: contains }, { description: contains }] }
        : { ...orgWhere, OR: [{ name: contains }, { description: contains }] },
      take: MAX_PER_TYPE * 2,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, description: true, updatedAt: true },
    }),
    prisma.server.findMany({
      where: { ...orgWhere, OR: [{ name: contains }, { hostname: contains }, { ipAddress: contains }] },
      take: MAX_PER_TYPE * 2,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, hostname: true, ipAddress: true, updatedAt: true },
    }),
    // Tickets: staff see all; clients see their own plus member-org tickets (same as list)
    prisma.ticket.findMany({
      where: isStaff
        ? { ...(organizationId ? { organizationId } : {}), OR: [{ subject: contains }, { description: contains }] }
        : {
            AND: [
              {
                OR: [
                  { createdByUserId: user.id },
                  { organizationId: scope.mode === 'limited' && scope.orgIds.length > 0 ? { in: scope.orgIds } : { in: ['__none__'] } },
                ],
              },
              { OR: [{ subject: contains }, { description: contains }] },
            ],
          },
      take: MAX_PER_TYPE * 2,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, subject: true, description: true, status: true, updatedAt: true },
    }),
    isStaff
      ? prisma.organization.findMany({
          where: { name: contains },
          take: MAX_PER_TYPE,
          orderBy: { updatedAt: 'desc' },
          select: { id: true, name: true, updatedAt: true },
        })
      : Promise.resolve([]),
  ]);

  // Relevance: title hits outrank body hits; recent records break ties
  function rank<T extends { updatedAt: Date }>(items: T[], fields: (t: T) => { title: string; body?: string }): T[] {
    return items
      .map((t) => {
        const { title, body } = fields(t);
        const titleHit = title.toLowerCase().includes(lc);
        const bodyHit = !!body && body.toLowerCase().includes(lc);
        return { t, s: (titleHit ? 100 : 0) + (bodyHit ? 10 : 0) - Math.min(20, (Date.now() - t.updatedAt.getTime()) / 86400000) };
      })
      .sort((a, b) => b.s - a.s)
      .slice(0, MAX_PER_TYPE)
      .map((x) => x.t);
  }

  const groups: { type: string; label: string; items: SearchItem[] }[] = [
    {
      type: 'documents', label: 'Documents',
      items: rank(documents, (d) => ({ title: d.title ?? '', body: d.content ?? '' })).map((d) => ({
        id: d.id, title: d.title || 'Untitled',
        subtitle: d.content?.replace(/[#*`>\-[\]]/g, '').slice(0, 90),
        url: `/dashboard/documents/${d.id}`,
      })),
    },
    {
      type: 'passwords', label: 'Passwords',
      items: rank(passwords, (p) => ({ title: p.name ?? '', body: `${p.username ?? ''} ${p.url ?? ''}` })).map((p) => ({
        id: p.id, title: p.name || 'Untitled', subtitle: p.username || p.url || undefined, url: `/dashboard/passwords/${p.id}`,
      })),
    },
    {
      type: 'domains', label: 'Domains',
      items: rank(domains, (d) => ({ title: d.name ?? '', body: d.registrar ?? '' })).map((d) => ({
        id: d.id, title: d.name, subtitle: d.registrar || undefined, url: `/dashboard/domains/${d.id}`,
      })),
    },
    {
      type: 'assets', label: 'Assets',
      items: rank(assets, (a) => ({ title: a.name ?? '', body: a.assetType ?? '' })).map((a) => ({
        id: a.id, title: a.name || 'Untitled', subtitle: a.assetType || undefined, url: `/dashboard/assets/${a.id}`,
      })),
    },
    {
      type: 'servers', label: 'Servers',
      items: rank(servers, (s) => ({ title: s.name ?? '', body: `${s.hostname ?? ''} ${s.ipAddress ?? ''}` })).map((s) => ({
        id: s.id, title: s.name || 'Server', subtitle: s.hostname || s.ipAddress || undefined, url: `/dashboard/servers/${s.id}`,
      })),
    },
    {
      type: 'checklists', label: 'Checklists',
      items: rank(checklists, (c) => ({ title: c.name ?? '', body: c.description ?? '' })).map((c) => ({
        id: c.id, title: c.name || 'Checklist', subtitle: c.description?.slice(0, 80) || undefined, url: `/dashboard/checklists/${c.id}`,
      })),
    },
    {
      type: 'tickets', label: 'Tickets',
      items: rank(tickets, (t) => ({ title: t.subject ?? '', body: t.description ?? '' })).map((t) => ({
        id: String(t.id), title: t.subject, subtitle: `#${t.id} · ${t.status}`, url: `/dashboard/tickets/${t.id}`,
      })),
    },
    {
      type: 'organizations', label: 'Organizations',
      items: rank(organizations, (o) => ({ title: o.name ?? '' })).map((o) => ({
        id: o.id, title: o.name, url: `/dashboard/organizations/${o.id}`,
      })),
    },
  ].filter((g) => g.items.length > 0);

  return NextResponse.json({ query: q, groups });
}
