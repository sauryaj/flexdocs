import { expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resolveDocumentCapabilities } from '@/lib/document-capability-service';

const document = { userId: 'original-author', ownershipKind: 'organization' as const, organizationId: 'org', isArchived: false, deletedAt: null };
const actor = { id: 'member', role: 'editor' as const };

it('loads only the actor grant through current membership and rechecks revocation', async () => {
  const membership = vi.mocked(prisma.organizationMember.findUnique);
  membership.mockResolvedValueOnce({ organization: { documentationGrants: [{ organizationId: 'org', role: 'contributor' }] } } as never);
  expect((await resolveDocumentCapabilities(document, actor)).edit).toBe(true);
  expect(membership).toHaveBeenLastCalledWith({
    where: { organizationId_userId: { organizationId: 'org', userId: 'member' } },
    select: { organization: { select: { documentationGrants: { where: { userId: 'member' }, select: { organizationId: true, role: true } } } } },
  });
  membership.mockResolvedValueOnce(null);
  expect((await resolveDocumentCapabilities(document, actor)).edit).toBe(false);
  membership.mockResolvedValueOnce({ organization: { documentationGrants: [] } } as never);
  expect((await resolveDocumentCapabilities(document, actor)).edit).toBe(false);
});

it('does not consult organization grants for personal documents', async () => {
  const membership = vi.mocked(prisma.organizationMember.findUnique);
  membership.mockClear();
  expect((await resolveDocumentCapabilities({ ...document, ownershipKind: 'personal', userId: actor.id }, actor)).edit).toBe(true);
  expect(membership).not.toHaveBeenCalled();
});

it('propagates database failures rather than inferring an access grant', async () => {
  vi.mocked(prisma.organizationMember.findUnique).mockRejectedValueOnce(new Error('unavailable'));
  await expect(resolveDocumentCapabilities(document, actor)).rejects.toThrow('unavailable');
});
