import { z } from 'zod';

const timestamp = z.string().datetime({ offset: true });
const revision = z.object({
  id: z.string().min(1), title: z.string(), content: z.string(), category: z.string(),
  version: z.number().int().positive().max(2147483647),
  message: z.string().nullable().optional(), createdAt: timestamp.optional(),
});
const attachment = z.object({
  filename: z.string().min(1), mimeType: z.string().min(1).optional(),
  size: z.number().int().nonnegative().max(14_000_000),
  data: z.string().max(4 * Math.ceil(14_000_000 / 3)),
}).superRefine((value, context) => {
  if (value.data.length > 4 * Math.ceil(14_000_000 / 3)) return;
  const bytes = Buffer.from(value.data, 'base64');
  if (bytes.toString('base64') !== value.data || bytes.length !== value.size) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['data'], message: 'Attachment bytes do not match the declared size or canonical base64 encoding' });
  }
});
const document = z.object({
  id: z.string().min(1), title: z.string(), content: z.string().optional(),
  type: z.string().optional(), category: z.string().optional(),
  isPinned: z.boolean().optional(), isArchived: z.boolean().optional(),
  visibility: z.enum(['private', 'org']).optional(),
  deletedAt: timestamp.nullable().optional(), reviewDate: timestamp.nullable().optional(),
  lastReviewedAt: timestamp.nullable().optional(), createdAt: timestamp.optional(), updatedAt: timestamp.optional(),
  tagNames: z.array(z.string().min(1)).optional(),
  revisions: z.array(revision).optional(), attachments: z.array(attachment).optional(),
});

export function validateImportedDocuments(values: unknown[]): string[] {
  const errors: string[] = [];
  const revisionIds = new Set<string>();
  for (const [index, value] of values.entries()) {
    const parsed = document.safeParse(value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors.push(`documents[${index}].${issue.path.join('.')}: ${issue.message}`);
      continue;
    }
    const versions = new Set<number>();
    for (const [revisionIndex, item] of (parsed.data.revisions ?? []).entries()) {
      if (revisionIds.has(item.id) || versions.has(item.version)) errors.push(`documents[${index}].revisions[${revisionIndex}]: duplicate revision identifier or version`);
      revisionIds.add(item.id);
      versions.add(item.version);
    }
  }
  return errors;
}
