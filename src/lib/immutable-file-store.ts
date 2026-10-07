import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { MAX_ATTACHMENT_BYTES } from '@/lib/attachment-upload';
import logger from '@/lib/logger';

export interface ImmutableFileReference { key: string; sha256: string; size: number }
export interface ImmutableFileStore {
  put(bytes: Buffer): Promise<ImmutableFileReference>;
  read(reference: ImmutableFileReference): Promise<Buffer>;
}
export const PUBLICATION_OBJECT_DIRECTORY = 'publication-objects';
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

export function isImmutableFileReference(value: unknown): value is ImmutableFileReference {
  if (!value || typeof value !== 'object') return false;
  const reference = value as Partial<ImmutableFileReference>;
  return typeof reference.key === 'string' && /^[a-f0-9]{64}$/.test(reference.key) && reference.sha256 === reference.key &&
    typeof reference.size === 'number' && Number.isInteger(reference.size) && reference.size >= 0 && reference.size <= MAX_ATTACHMENT_BYTES;
}

export class LocalImmutableFileStore implements ImmutableFileStore {
  constructor(private readonly uploadRoot: string) {
    if (!isAbsolute(uploadRoot)) throw new Error('Immutable storage requires an absolute upload directory');
  }

  private async directory(create = false) {
    if (create) await mkdir(this.uploadRoot, { recursive: true });
    const root = await realpath(this.uploadRoot);
    const directory = join(root, PUBLICATION_OBJECT_DIRECTORY);
    if (create) await mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(directory);
    if (stat.isSymbolicLink()) throw new Error('Publication storage directory must not be a symlink');
    if (!stat.isDirectory()) throw new Error('Publication storage requires a directory');
    return directory;
  }

  async put(bytes: Buffer): Promise<ImmutableFileReference> {
    if (bytes.length > MAX_ATTACHMENT_BYTES) throw new Error('Maximum immutable file size is 10 MiB');
    const frozen = Buffer.from(bytes);
    const sha256 = digest(frozen);
    const reference = { key: sha256, sha256, size: frozen.length };
    const directory = await this.directory(true);
    const temporary = join(directory, `.pending-${randomUUID()}`);
    try {
      const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { await file.writeFile(frozen); await file.sync(); } finally { await file.close(); }
      // A hard link exposes only complete bytes and never overwrites an existing content-addressed object.
      try { await link(temporary, join(directory, reference.key)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      await this.read(reference);
      const parent = await open(directory, constants.O_RDONLY);
      try { await parent.sync(); } finally { await parent.close(); }
      return reference;
    } finally {
      try { await unlink(temporary); } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') logger.warn('Immutable storage temporary cleanup pending', { code });
      }
    }
  }

  async read(reference: ImmutableFileReference): Promise<Buffer> {
    if (!isImmutableFileReference(reference)) throw new Error('Invalid immutable file reference');
    const file = await open(join(await this.directory(), reference.key), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size !== reference.size) throw new Error('Immutable file size mismatch');
      const buffer = Buffer.alloc(reference.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const result = await file.read(buffer, length, buffer.length - length, null);
        if (!result.bytesRead) break;
        length += result.bytesRead;
      }
      const bytes = buffer.subarray(0, length);
      if (bytes.length !== reference.size || digest(bytes) !== reference.sha256) throw new Error('Immutable file integrity failure');
      return bytes;
    } finally { await file.close(); }
  }
}
