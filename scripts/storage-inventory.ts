import { PrismaClient } from '@prisma/client';
import { isAbsolute } from 'node:path';
import { inspectAttachmentStorage } from '../src/lib/storage-inventory';

async function main() {
  const root = process.env.UPLOAD_DIR;
  if (!root || !isAbsolute(root) || !process.env.DATABASE_URL) throw new Error('Set DATABASE_URL and an absolute UPLOAD_DIR for the same installation.');
  const db = new PrismaClient();
  try {
    const records = await db.attachment.findMany({ where: { storageType: 'filesystem' }, select: { id: true, filePath: true } });
    const report = await inspectAttachmentStorage(root, records);
    console.log(JSON.stringify({ readOnly: true, warning: 'Point-in-time inventory; concurrent uploads/deletes can change results. No files are deleted. Review configuration, backups and references before any cleanup.', ...report }, null, 2));
    if (report.missing.length || report.outsideRoot.length || report.skippedSymlinks.length || report.unreferenced.length) process.exitCode = 2;
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error('Storage inventory failed. Check database access, upload directory and filesystem permissions; no cleanup was performed.'); process.exitCode = 1; });
