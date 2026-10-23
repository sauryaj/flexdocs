import { z } from 'zod';
import { MAX_ATTACHMENT_BYTES } from '@/lib/attachment-upload';

const file = z.object({
  attachmentId: z.string().min(1).max(255), filename: z.string().min(1).max(255), mimeType: z.string().max(255),
  key: z.string().regex(/^[a-f0-9]{64}$/), sha256: z.string().regex(/^[a-f0-9]{64}$/), size: z.number().int().min(0).max(MAX_ATTACHMENT_BYTES),
}).strict().refine(value => value.key === value.sha256);
export const publicationManifestSchema = z.array(file).max(10).refine(files => new Set(files.map(file => file.attachmentId)).size === files.length && files.reduce((sum, file) => sum + file.size, 0) <= 50 * 1024 * 1024);
export const publicationTagsSchema = z.array(z.string().min(1).max(100)).max(1000);
export type PublicationFile = z.infer<typeof file>;
