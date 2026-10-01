import { z } from 'zod';

export const folderFields = z.object({
  name: z.string().trim().min(1).max(200),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().trim().min(1).max(64).optional(),
});

export const folderCreateSchema = folderFields.extend({
  parentId: z.string().min(1).nullable().optional(),
  organizationId: z.string().min(1).nullable().optional(),
});

export const folderUpdateSchema = folderFields.partial();
