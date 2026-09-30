import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getOrgScope } from '@/lib/org-scope';
import { hasPermission } from '@/lib/rbac';
import { DocumentWriteError } from '@/lib/document-write';
import { publicationTagsSchema } from '@/lib/publication-manifest';

export interface DocumentDiscoveryOptions {
  query?: string;
  terms?: string[];
  organizationId?: string;
  category?: string | null;
  folderId?: string | null;
  excludeArchived?: boolean;
  page: number;
  limit: number;
}

export async function discoverDocuments(actorId: string, options: DocumentDiscoveryOptions) {
  const page = Math.min(1_000_000, Math.max(0, Math.floor(options.page) || 0));
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit) || 50));
  const query = options.query?.trim() || '';
  if (query.length > 500) throw new DocumentWriteError(400, 'Search is limited to 500 characters');
  const terms = options.terms === undefined ? (query ? [query] : []) : options.terms;
  if (terms.length > 8 || terms.some(term => !term.trim() || term.length > 500)) throw new DocumentWriteError(400, 'Invalid search terms');
  return prisma.$transaction(async tx => {
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
    if (!actor || !hasPermission(actor.role, 'document.read')) throw new DocumentWriteError(404, 'Not found');
    const scope = await getOrgScope(actor.id, actor.role, tx);
    const scoped = scope.mode === 'all' ? Prisma.sql`d."organizationId" IS NOT NULL`
      : scope.orgIds.length ? Prisma.sql`d."organizationId" IN (${Prisma.join(scope.orgIds)})` : Prisma.sql`FALSE`;
    const membership = Prisma.sql`EXISTS (SELECT 1 FROM "OrganizationMember" m
      JOIN "OrganizationDocumentationGrant" g ON g."organizationId" = m."organizationId" AND g."userId" = m."userId"
      WHERE m."userId" = ${actor.id} AND m."organizationId" = d."organizationId"
      AND g.role::text IN ('reader', 'contributor', 'reviewer', 'administrator'))`;
    const maintenance = hasPermission(actor.role, 'document.update') ? Prisma.sql`EXISTS (SELECT 1 FROM "OrganizationMember" m
      JOIN "OrganizationDocumentationGrant" g ON g."organizationId" = m."organizationId" AND g."userId" = m."userId"
      WHERE m."userId" = ${actor.id} AND m."organizationId" = d."organizationId"
      AND g.role::text IN ('contributor', 'reviewer', 'administrator'))` : Prisma.sql`FALSE`;
    const shared = Prisma.sql`d.visibility = 'org' AND NOT d."isArchived" AND ${scoped}`;
    // Choose the visible version before matching, sorting or counting; working fields must not influence reader results.
    const representations = Prisma.sql`WITH access AS (
      SELECT d.*, ((d."ownershipKind" = 'personal' AND (d."userId" = ${actor.id} OR (d."lifecycleState" IS NULL AND ${shared})))
        OR (d."ownershipKind" = 'organization' AND ${maintenance})) AS working
      FROM "Document" d WHERE d."deletedAt" IS NULL
      ${options.organizationId ? Prisma.sql`AND d."organizationId" = ${options.organizationId}` : Prisma.empty}
    ), visible AS (
      SELECT d.id, d.working,
        CASE WHEN d.working THEN d.title ELSE p.title END AS title,
        CASE WHEN d.working THEN d.content ELSE p.content END AS content,
        CASE WHEN d.working THEN d.category ELSE p.category END AS category,
        CASE WHEN d.working THEN d."folderId" ELSE NULL END AS "folderId",
        CASE WHEN d.working THEN d."isPinned" ELSE FALSE END AS "isPinned",
        CASE WHEN d.working THEN d."updatedAt" ELSE p."publishedAt" END AS "updatedAt",
        d."isArchived"
      FROM access d LEFT JOIN "DocumentPublication" p ON p.id = d."publishedSnapshotId" AND p."documentId" = d.id
      WHERE d.working OR (p.id IS NOT NULL AND NOT d."isArchived" AND
        ((d."ownershipKind" = 'organization' AND ${membership}) OR
         (d."ownershipKind" = 'personal' AND d."lifecycleState" IS NOT NULL AND ${shared})))
    ), filtered AS (
      SELECT * FROM visible WHERE TRUE
      ${terms.length ? Prisma.sql`AND (${Prisma.join(terms.map(term => Prisma.sql`(position(lower(${term}) in lower(title)) > 0 OR position(lower(${term}) in lower(content)) > 0)`), ' OR ')})` : Prisma.empty}
      ${options.category ? Prisma.sql`AND category = ${options.category}` : Prisma.empty}
      ${options.folderId ? Prisma.sql`AND "folderId" = ${options.folderId}` : Prisma.empty}
      ${options.excludeArchived ? Prisma.sql`AND NOT "isArchived"` : Prisma.empty}
    )`;
    const counts = await tx.$queryRaw<{ total: bigint; available: bigint }[]>(Prisma.sql`${representations}
      SELECT (SELECT count(*) FROM filtered) AS total, (SELECT count(*) FROM visible) AS available`);
    const selected = await tx.$queryRaw<{ id: string; working: boolean }[]>(Prisma.sql`${representations}
      SELECT id, working FROM filtered ORDER BY "isPinned" DESC, "updatedAt" DESC, id ASC LIMIT ${limit} OFFSET ${page * limit}`);
    const records = await tx.document.findMany({ where: { id: { in: selected.map(item => item.id) } }, include: { tags: true, folder: true, publishedSnapshot: true } });
    const byId = new Map(records.map(record => [record.id, record]));
    const items = selected.map(item => {
      const record = byId.get(item.id);
      if (!record) throw new DocumentWriteError(503, 'Document representation is unavailable');
      const { publishedSnapshot, ...document } = record;
      if (item.working) return { ...document, representation: 'working' as const };
      if (!publishedSnapshot) throw new DocumentWriteError(503, 'Published representation is unavailable');
      const tags = publicationTagsSchema.safeParse(publishedSnapshot.tags);
      if (!tags.success) throw new DocumentWriteError(503, 'Published metadata is unavailable');
      return { id: document.id, organizationId: document.organizationId, title: publishedSnapshot.title,
        content: publishedSnapshot.content, category: publishedSnapshot.category, type: 'markdown',
        tags: tags.data.map((name, index) => ({ id: `published-tag-${index}`, name })), folder: null, folderId: null,
        isPinned: false, isArchived: false, deletedAt: null, canEdit: false, representation: 'published' as const,
        snapshotId: publishedSnapshot.id, createdAt: publishedSnapshot.publishedAt, updatedAt: publishedSnapshot.publishedAt };
    });
    const total = Number(counts[0].total);
    return { items, total, totalAvailable: Number(counts[0].available), page, limit, hasMore: (page + 1) * limit < total };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
