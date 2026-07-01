import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';

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
  const ext = filename.includes('.') ? filename.split('.').pop() : 'bin';
  const uniqueName = `${randomBytes(8).toString('hex')}.${ext}`;
  return join(dir, uniqueName);
}

export async function storeFile(
  data: string, // base64
  filename: string,
  mimeType: string,
  size: number,
  userId: string,
  documentId?: string
) {
  ensureUploadDir();
  const filePath = getFilePath(filename, userId);
  const buffer = Buffer.from(data, 'base64');
  writeFileSync(filePath, buffer);

  return prisma.attachment.create({
    data: {
      filename,
      mimeType,
      size,
      filePath,
      storageType: 'filesystem',
      documentId: documentId || null,
      userId,
    },
  });
}

export async function getAttachmentData(attachmentId: string, userId: string) {
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, userId },
  });

  if (!attachment) return null;

  if (attachment.storageType === 'filesystem' && attachment.filePath) {
    const buffer = readFileSync(attachment.filePath);
    return {
      ...attachment,
      data: buffer.toString('base64'),
    };
  }

  return attachment;
}

export async function deleteFile(attachmentId: string, userId: string) {
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, userId },
  });

  if (!attachment) return null;

  if (attachment.storageType === 'filesystem' && attachment.filePath) {
    try {
      if (existsSync(attachment.filePath)) {
        unlinkSync(attachment.filePath);
      }
    } catch {
      // File might already be deleted
    }
  }

  await prisma.attachment.delete({ where: { id: attachmentId } });
  return attachment;
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
      console.error(`Failed to migrate attachment ${att.id}:`, err);
    }
  }

  return { total: attachments.length, migrated };
}
