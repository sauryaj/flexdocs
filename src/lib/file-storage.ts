import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs';
import logger from '@/lib/logger';
import { writeFile } from 'node:fs/promises';
import { lockDocumentationAdministration } from '@/lib/documentation-grants';
import { DocumentWriteError } from '@/lib/document-write';
import { hasPermission } from '@/lib/rbac';
import { readWorkingAttachmentBytes } from '@/lib/working-attachment-bytes';
import { LocalImmutableFileStore, PUBLICATION_OBJECT_DIRECTORY, isImmutableFileReference, type ImmutableFileStore } from '@/lib/immutable-file-store';
import { type Prisma } from '@prisma/client';

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function getFilePath(filename: string, userId: string): string {
  const dateDir = new Date().toISOString().slice(0, 7); // YYYY-MM
  const dir = join(UPLOAD_DIR, userId, dateDir);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const ext = filename.match(/\.([a-zA-Z0-9]{1,16})$/)?.[1] || 'bin';
  const uniqueName = `${randomBytes(8).toString('hex')}.${ext}`;
  return join(dir, uniqueName);
}

export async function storeFile(
  data: string, // base64
  filename: string,
  mimeType: string,
  _size: number,
  userId: string,
  documentId?: string,
  options: PersonalUploadOptions = {},
) {
  return storeFileBytes(Buffer.from(data, 'base64'), filename, mimeType, userId, documentId, options);
}

type PersonalUploadOptions = { restoreTrashed?: boolean; writeBytes?: (path: string, bytes: Buffer) => Promise<void> };

export async function storeFileBytes(buffer: Buffer, filename: string, mimeType: string, userId: string, documentId?: string,
  options: PersonalUploadOptions = {}) {
  let filePath: string | undefined;
  let databaseWriteStarted = false;
  try {
    return await prisma.$transaction(async tx => {
      await lockDocumentationAdministration(tx);
      const actor = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (!actor || !hasPermission(actor.role, 'document.update')) throw new DocumentWriteError(403, 'Forbidden');
      if (options.restoreTrashed && actor.role !== 'admin') throw new DocumentWriteError(403, 'Forbidden');
      if (documentId) {
        await tx.$queryRaw`SELECT "id" FROM "Document" WHERE "id" = ${documentId} FOR UPDATE`;
        const document = await tx.document.findFirst({ where: { id: documentId, userId, ownershipKind: 'personal',
          ...(options.restoreTrashed ? {} : { deletedAt: null }) } });
        if (!document) throw new DocumentWriteError(404, 'Document not found');
      }
      ensureUploadDir();
      filePath = getFilePath(filename, userId);
      await (options.writeBytes || writeFile)(filePath, buffer);
      databaseWriteStarted = true;
      return tx.attachment.create({
        data: {
          filename,
          mimeType,
          size: buffer.length,
          filePath,
          storageType: 'filesystem',
          documentId: documentId || null,
          userId,
        },
      });
    });
  } catch (error) {
    // A failed response may follow a committed transaction. Retain bytes once the database write starts.
    if (filePath && !databaseWriteStarted) try { unlinkSync(filePath); } catch { /* Preserve the original storage error if cleanup fails. */ }
    throw error;
  }
}

export async function getAttachmentData(attachmentId: string, userId: string) {
  const where = { id: attachmentId, userId, OR: [{ documentId: null }, { document: { deletedAt: null, ownershipKind: 'personal' as const } }] };
  const attachment = await prisma.attachment.findFirst({
    where,
  });

  if (!attachment) return null;

  if (attachment.storageType === 'filesystem' && attachment.filePath) {
    try {
      const buffer = readFileSync(attachment.filePath);
      const current = await prisma.attachment.findFirst({ where });
      if (!current || current.filePath !== attachment.filePath || current.storageType !== attachment.storageType || current.size !== attachment.size ||
        current.filename !== attachment.filename || current.mimeType !== attachment.mimeType) return null;
      return { ...attachment, data: buffer.toString('base64') };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  return attachment;
}

async function lockAttachmentParent(tx: Prisma.TransactionClient, attachmentId: string) {
  const current = await tx.attachment.findUnique({ where: { id: attachmentId }, select: { documentId: true } });
  if (current?.documentId) await tx.$queryRaw`SELECT "id" FROM "Document" WHERE "id" = ${current.documentId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "Attachment" WHERE "id" = ${attachmentId} FOR UPDATE`;
}

type PreservationOptions = { uploadRoot?: string; storage?: ImmutableFileStore; readBytes?: typeof readWorkingAttachmentBytes };

export async function deleteFile(attachmentId: string, userId: string, options: PreservationOptions = {}) {
  return prisma.$transaction(async tx => {
    await lockDocumentationAdministration(tx);
    const actor = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!actor || !hasPermission(actor.role, 'document.delete')) throw new DocumentWriteError(403, 'Forbidden');
    await lockAttachmentParent(tx, attachmentId);
    const where = { id: attachmentId, userId, OR: [{ documentId: null }, { document: { deletedAt: null, ownershipKind: 'personal' as const } }] };
    const attachment = await tx.attachment.findFirst({ where });
    if (!attachment) return null;
    const root = options.uploadRoot || UPLOAD_DIR;
    try {
      const bytes = await (options.readBytes || readWorkingAttachmentBytes)(attachment, root);
      await (options.storage || new LocalImmutableFileStore(root)).put(bytes);
    } catch { throw new DocumentWriteError(503, 'Unable to preserve attachment bytes; file was not removed'); }
    if ((await tx.attachment.deleteMany({ where })).count !== 1) return null;
    await tx.activityLog.create({ data: { userId, action: 'attachment.delete', resourceType: 'attachment', resourceId: attachmentId,
      details: JSON.stringify({ documentId: attachment.documentId, bytesRetained: true }) } });
    // Original and immutable copies remain until reference-aware retention can prove they are unused.
    return { ...attachment, cleanupPending: true, bytesRetained: true };
  });
}

export async function migrateBase64Attachments(options: PreservationOptions & { attachmentIds?: string[] } = {}) {
  const attachments = await prisma.attachment.findMany({
    where: { storageType: 'base64', data: { not: null }, ...(options.attachmentIds ? { id: { in: options.attachmentIds } } : {}) },
    select: { id: true },
  });

  let migrated = 0;
  let failed = 0;
  for (const att of attachments) {
    try {
      const changed = await prisma.$transaction(async tx => {
        await lockDocumentationAdministration(tx);
        await lockAttachmentParent(tx, att.id);
        const current = await tx.attachment.findUnique({ where: { id: att.id } });
        if (!current || current.storageType !== 'base64' || current.data === null) return false;
        const root = options.uploadRoot || UPLOAD_DIR;
        const bytes = await (options.readBytes || readWorkingAttachmentBytes)(current, root);
        const reference = await (options.storage || new LocalImmutableFileStore(root)).put(bytes);
        if (!isImmutableFileReference(reference)) throw new DocumentWriteError(503, 'Invalid file storage response');
        await tx.attachment.update({ where: { id: att.id }, data: {
          filePath: join(root, PUBLICATION_OBJECT_DIRECTORY, reference.key), storageType: 'filesystem', data: null,
        } });
        return true;
      });
      if (changed) migrated++;
    } catch {
      failed++;
      logger.error('Attachment storage migration could not be confirmed; bytes retained', { attachmentId: att.id });
    }
  }

  return { total: attachments.length, migrated, failed, skipped: attachments.length - migrated - failed };
}
