import { createHash } from 'node:crypto';
import { z } from 'zod';

export const invitationRequest = z.object({
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  role: z.enum(['admin', 'editor', 'viewer']).default('viewer'),
  organizationId: z.string().min(1).nullable().optional(),
});
export const invitationAcceptance = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  name: z.string().trim().min(1).max(100).optional(),
  password: z.string().min(12).max(200).optional(),
});
export function invitationHash(token: string) { return createHash('sha256').update(token).digest('hex'); }
export function invitationUrl(token: string) {
  const base = new URL(process.env.NEXTAUTH_URL || 'http://localhost:3001');
  return `${base.origin}/invite#token=${token}`;
}
