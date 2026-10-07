import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import logger from '@/lib/logger';
import { writeFile } from 'node:fs/promises';
import { lockDocumentationAdministration } from '@/lib/documentation-grants';
import { DocumentWriteError } from '@/lib/document-write';
import { hasPermission } from '@/lib/rbac';

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
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, userId, OR: [{ documentId: null }, { document: { deletedAt: null, ownershipKind: 'personal' } }] },
  });

  if (!attachment) return null;

  if (attachment.storageType === 'filesystem' && attachment.filePath) {
    try {
      const buffer = readFileSync(attachment.filePath);
      return { ...attachment, data: buffer.toString('base64') };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  return attachment;
}

export async function deleteFile(attachmentId: string, userId: string) {
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, userId, OR: [{ documentId: null }, { document: { deletedAt: null, ownershipKind: 'personal' } }] },
  });

  if (!attachment) return null;

  const removed = await prisma.attachment.deleteMany({
    where: { id: attachmentId, userId, OR: [{ documentId: null }, { document: { deletedAt: null, ownershipKind: 'personal' } }] },
  });
  if (removed.count !== 1) return null;

  let cleanupPending = false;
  if (attachment.storageType === 'filesystem' && attachment.filePath) {
    try {
      unlinkSync(attachment.filePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        cleanupPending = true;
        logger.warn('Attachment removed; storage cleanup pending', { attachmentId, code });
      }
    }
  }

  return { ...attachment, cleanupPending };
}

export async function migrateBase64Attachments() {
  ensureUploadDir();
  const attachments = await prisma.attachment.findMany({
    where: { storageType: 'base64', data: { not: null } },
  });

  let migrated = 0;
  for (const att of attachments) {
    if (!att.data) continue;
    try {
      const filePath = getFilePath(att.filename, att.userId);
      const buffer = Buffer.from(att.data, 'base64');
      writeFileSync(filePath, buffer);

      await prisma.attachment.update({
        where: { id: att.id },
        data: {
          filePath,
          storageType: 'filesystem',
          data: null,
        },
      });
      migrated++;
    } catch (err) {
      logger.error(`Failed to migrate attachment ${att.id}`, { err });
    }
  }

  return { total: attachments.length, migrated };
}
