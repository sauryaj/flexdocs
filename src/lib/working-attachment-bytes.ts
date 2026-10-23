import { type Attachment } from '@prisma/client';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';
import { MAX_ATTACHMENT_BYTES } from '@/lib/attachment-upload';
import { DocumentWriteError } from '@/lib/document-write';

export async function readWorkingAttachmentBytes(attachment: Pick<Attachment, 'size' | 'storageType' | 'data' | 'filePath'>, uploadRoot: string): Promise<Buffer> {
  if (!isAbsolute(uploadRoot)) throw new DocumentWriteError(503, 'Configure an absolute upload root');
  if (attachment.size < 0 || attachment.size > MAX_ATTACHMENT_BYTES) throw new DocumentWriteError(413, 'Maximum file size is 10 MiB');
  let bytes: Buffer;
  if (attachment.storageType === 'base64' && attachment.data !== null) {
    if (attachment.data.length > 14_000_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(attachment.data)) throw new DocumentWriteError(409, 'Invalid stored attachment encoding');
    bytes = Buffer.from(attachment.data, 'base64');
  } else if (attachment.storageType === 'filesystem' && attachment.filePath) {
    const root = await realpath(uploadRoot);
    if ((await lstat(attachment.filePath)).isSymbolicLink()) throw new DocumentWriteError(409, 'Attachment symlinks are not supported');
    const path = await realpath(attachment.filePath);
    const rel = relative(root, path);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new DocumentWriteError(409, 'Attachment is outside the upload root');
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size !== attachment.size) throw new DocumentWriteError(409, 'Attachment size mismatch');
      const buffer = Buffer.alloc(attachment.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const result = await file.read(buffer, length, buffer.length - length, null);
        if (!result.bytesRead) break;
        length += result.bytesRead;
      }
      bytes = buffer.subarray(0, length);
    } finally { await file.close(); }
  } else throw new DocumentWriteError(409, 'Attachment storage is unavailable');
  if (bytes.length !== attachment.size) throw new DocumentWriteError(409, 'Attachment size mismatch');
  if (attachment.filePath && attachment.storageType === 'filesystem') {
    const rel = relative(await realpath(uploadRoot), await realpath(attachment.filePath));
    const immutableKey = rel.match(/^publication-objects[/\\]([a-f0-9]{64})$/)?.[1];
    if (immutableKey && createHash('sha256').update(bytes).digest('hex') !== immutableKey) throw new DocumentWriteError(409, 'Attachment integrity failure');
  }
  return bytes;
}
