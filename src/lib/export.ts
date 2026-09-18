import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { existsSync, readFileSync } from 'fs';

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export interface BackupBundle {
  schema: 'flexdocs-backup';
  version: 1;
  exportedAt: string;
  scope: 'full' | 'organization';
  organizationId?: string;
  organizations: unknown[];
  members: unknown[];
  folders: unknown[];
  documents: unknown[];
  assets: unknown[];
  assetTypes: unknown[];
  checklists: unknown[];
  checklistItems: unknown[];
  passwords: unknown[];
  domains: unknown[];
  sslCertificates: unknown[];
  renewals: unknown[];
  servers: unknown[];
  ipamNetworks: unknown[];
  contacts: unknown[];
  locations: unknown[];
  websites: unknown[];
  tickets: unknown[];
  relationships: unknown[];
  tags: string[];
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function pluck<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      out[k] = v instanceof Date ? v.toISOString() : v;
    }
    return out as unknown as T;
  });
}

/** Build a portable backup bundle. `filter.organizationId` scopes to one tenant (offboarding). */
export async function buildBackup(filter?: { organizationId?: string }): Promise<BackupBundle> {
  const orgId = filter?.organizationId;
  const orgWhere = orgId ? { organizationId: orgId } : {};

  const docWhere = orgId
    ? { OR: [{ organizationId: orgId }, { organizationId: null }] }
    : {};

  const [organizations, documents, passwords, domains, sslCertificates, assets, assetTypes, checklists, checklistItems, renewals, servers, ipamNetworks, contacts, locations, websites, tickets, replies, relationships, folders, members] =
    await Promise.all([
      prisma.organization.findMany(orgId ? { where: { id: orgId } } : undefined),
      prisma.document.findMany({ where: docWhere, include: { attachments: true, tags: true } }),
      prisma.password.findMany({ where: orgWhere, include: { tags: true } }),
      prisma.domain.findMany({ where: orgWhere, include: { tags: true } }),
      orgId
        ? prisma.sslCertificate.findMany({ where: { OR: [{ organizationId: orgId }, { domains: { some: { organizationId: orgId } } }] } })
        : prisma.sslCertificate.findMany(),
      prisma.flexibleAsset.findMany({ where: orgWhere }),
      prisma.flexibleAssetType.findMany(), // global per-user; keep all
      prisma.checklist.findMany({ where: orgWhere }),
      prisma.checklistItem.findMany(),
      prisma.renewalItem.findMany({ where: orgWhere }),
      prisma.server.findMany({ where: orgWhere }),
      prisma.ipamNetwork.findMany({ where: orgWhere }),
      prisma.contact.findMany({ where: orgWhere }),
      prisma.location.findMany({ where: orgWhere }),
      prisma.website.findMany({ where: orgWhere }),
      prisma.ticket.findMany({ where: orgWhere, orderBy: { id: 'asc' } }),
      prisma.ticketReply.findMany(),
      prisma.relationship.findMany(),
      prisma.folder.findMany({ where: docWhere }),
      orgId
        ? prisma.organizationMember.findMany({ where: { organizationId: orgId }, include: { user: { select: { email: true } } } })
        : prisma.organizationMember.findMany({ include: { user: { select: { email: true } } } }),
    ]);

  // Decrypt secret material so the backup is truly portable
  const passwordsOut = passwords.map((p) => {
    const { password, totpSecret, ...rest } = pluck([p])[0];
    try {
      return {
        ...rest,
        password: decrypt(p.password),
        totpSecret: p.totpSecret ? decrypt(p.totpSecret) : null,
        tagNames: p.tags.map((t) => t.name),
      };
    } catch {
      return { ...rest, password: '', totpSecret: null, tagNames: [] };
    }
  });

  const docsOut = documents.map((d) => {
    const plain = pluck([d])[0];
    const attachments = d.attachments.map((a) => {
      const out: Record<string, unknown> = {
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
      };
      if (a.storageType === 'filesystem' && a.filePath && existsSync(a.filePath)) {
        const buf = readFileSync(a.filePath);
        if (buf.length <= MAX_ATTACHMENT_BYTES) out.data = buf.toString('base64');
      }
      return out;
    });
    return { ...plain, attachments, tagNames: d.tags.map((t) => t.name) };
  });

  const checklistItemsByChecklist = new Map<string, unknown[]>();
  for (const item of checklistItems) {
    const list = checklistItemsByChecklist.get(item.checklistId) || [];
    list.push(pluck([item])[0]);
    checklistItemsByChecklist.set(item.checklistId, list);
  }
  const checklistsOut = checklists.map((c) => ({
    ...pluck([c])[0],
    items: checklistItemsByChecklist.get(c.id) || [],
  }));

  const repliesByTicket = new Map<number, unknown[]>();
  for (const r of replies) {
    const list = repliesByTicket.get(r.ticketId) || [];
    list.push(pluck([r])[0]);
    repliesByTicket.set(r.ticketId, list);
  }
  const ticketsOut = tickets.map((t) => ({
    ...pluck([t])[0],
    replies: repliesByTicket.get(t.id) || [],
  }));

  const membersOut = members.map((m) => ({
    organizationId: m.organizationId,
    role: m.role,
    email: (m.user as unknown as { email: string }).email,
  }));

  const tagSet = new Set<string>();
  for (const d of documents) d.tags.forEach((t) => tagSet.add(t.name));
  for (const p of passwords) p.tags.forEach((t) => tagSet.add(t.name));
  for (const d of domains) d.tags.forEach((t) => tagSet.add(t.name));

  return {
    schema: 'flexdocs-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    scope: orgId ? 'organization' : 'full',
    organizationId: orgId || undefined,
    organizations: pluck(organizations),
    members: membersOut,
    folders: pluck(folders),
    documents: docsOut,
    assets: pluck(assets),
    assetTypes: pluck(assetTypes),
    checklists: checklistsOut,
    checklistItems: [],
    passwords: passwordsOut,
    domains: pluck(domains),
    sslCertificates: pluck(sslCertificates),
    renewals: pluck(renewals),
    servers: pluck(servers),
    ipamNetworks: pluck(ipamNetworks),
    contacts: pluck(contacts),
    locations: pluck(locations),
    websites: pluck(websites),
    tickets: ticketsOut,
    relationships: pluck(relationships),
    tags: [...tagSet],
  };
}