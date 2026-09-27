import { createHash } from 'node:crypto';
import { z } from 'zod';
import { type UserRole } from '@prisma/client';
import { prisma } from './prisma';
import { getOrgScope } from './org-scope';
import { documentUpdateSchema, DocumentWriteError } from './document-write';

export const documentCreateSchema = documentUpdateSchema.pick({
  content: true, category: true, folderId: true, tags: true, reviewDate: true, visibility: true,
}).extend({ title: z.string().trim().min(1).max(500), organizationId: z.string().nullable().optional() });
export const creationKeySchema = z.string().uuid();

export function normalizeDocumentCreation(input: z.infer<typeof documentCreateSchema>) {
  return {
    title: input.title, content: input.content || '', category: input.category || 'general',
    folderId: input.folderId || null, organizationId: input.organizationId || null,
    reviewDate: input.reviewDate ? new Date(input.reviewDate).toISOString() : null,
    visibility: input.visibility === 'org' && input.organizationId ? 'org' : 'private',
    tags: [...new Set(input.tags || [])].sort(),
  };
}

export function documentCreationHash(input: z.infer<typeof documentCreateSchema>) {
  return createHash('sha256').update(JSON.stringify(normalizeDocumentCreation(input))).digest('hex');
}

export async function createDocument(userId: string, role: UserRole, input: z.infer<typeof documentCreateSchema>, key?: string) {
  const fields = normalizeDocumentCreation(input);
  const payloadHash = documentCreationHash(input);
  const scope = await getOrgScope(userId, role);
  const canUseOrganization = (id: string) => scope.mode === 'all' || scope.orgIds.includes(id);
  return prisma.$transaction(async tx => {
    if (key) {
      // Serialize this account's keyed creations; the record and document commit together.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const previous = await tx.documentCreationRequest.findUnique({ where: { userId_key: { userId, key } }, include: { document: { include: { tags: true } } } });
      if (previous) {
        if (previous.payloadHash !== payloadHash) throw new DocumentWriteError(409, 'This creation key was already used for different content. Retry the original request.');
        const document = previous.document;
        if (!document || document.deletedAt || document.userId !== userId) throw new DocumentWriteError(410, 'The document created by this request is no longer available. No duplicate was created.');
        if (document.organizationId && !canUseOrganization(document.organizationId)) throw new DocumentWriteError(403, 'Forbidden');
        return { document, replayed: true };
      }
    }
    if (fields.organizationId) {
      if (!canUseOrganization(fields.organizationId)) throw new DocumentWriteError(403, 'Forbidden');
      if (!await tx.organization.findUnique({ where: { id: fields.organizationId }, select: { id: true } })) throw new DocumentWriteError(404, 'Organization not found');
    }
    if (fields.folderId) {
      const folder = await tx.folder.findFirst({ where: { id: fields.folderId, userId }, select: { organizationId: true } });
      if (!folder) throw new DocumentWriteError(404, 'Folder not found');
      if (folder.organizationId !== fields.organizationId) throw new DocumentWriteError(400, 'Document and folder must belong to the same organization.');
    }
    const { tags, ...data } = fields;
    const document = await tx.document.create({ data: {
      ...data, userId,
      tags: tags.length ? { connectOrCreate: tags.map(name => ({ where: { name_userId: { name, userId } }, create: { name, userId } })) } : undefined,
    }, include: { tags: true } });
    await tx.documentRevision.create({ data: {
      documentId: document.id, title: document.title, content: document.content, category: document.category,
      version: 1, message: 'Initial version', userId,
    } });
    if (key) await tx.documentCreationRequest.create({ data: { userId, key, payloadHash, documentId: document.id } });
    return { document, replayed: false };
  });
}
