import { expect, it } from 'vitest';
import { documentCapabilities } from '@/lib/document-capabilities';
const personal = { userId: 'owner', ownershipKind: 'personal' as const, organizationId: 'org', isArchived: false, deletedAt: null };
const team = { ...personal, ownershipKind: 'organization' as const, hasPublishedSnapshot: true };
it('keeps personal maintenance owner-scoped and respects global read-only roles', () => {
  expect(documentCapabilities(personal, { id: 'owner', role: 'editor' })).toMatchObject({ readWorking: true, edit: true, publish: true });
  expect(documentCapabilities(personal, { id: 'other', role: 'admin' })).toMatchObject({ readWorking: false, edit: false, publish: false });
  expect(documentCapabilities(personal, { id: 'owner', role: 'viewer' })).toMatchObject({ readWorking: true, edit: false, publish: false, manageLifecycle: false });
});
it.each([
  ['reader', false, false, false],
  ['contributor', true, false, false],
  ['reviewer', true, true, false],
  ['administrator', true, true, true],
] as const)('enforces team %s capabilities', (role, edit, publish, manageLifecycle) => {
  expect(documentCapabilities(team, { id: 'member', role: 'editor', memberOfOrganization: true, grant: { organizationId: 'org', role } })).toMatchObject({ readPublished: true, readWorking: edit, edit, publish, manageLifecycle });
});
it('does not infer grants from provenance, global administration, or membership alone', () => {
  for (const actor of [
    { id: 'owner', role: 'admin' as const },
    { id: 'member', role: 'editor' as const, memberOfOrganization: true },
    { id: 'member', role: 'editor' as const, memberOfOrganization: true, grant: { organizationId: 'other', role: 'administrator' } },
    { id: 'member', role: 'editor' as const, memberOfOrganization: true, grant: { organizationId: 'org', role: 'unknown' } },
  ]) expect(Object.values(documentCapabilities(team, actor)).every(value => !value)).toBe(true);
});
it('requires membership and published snapshot, and bounds grants by global role', () => {
  const actor = { id: 'member', role: 'viewer' as const, memberOfOrganization: true, grant: { organizationId: 'org', role: 'administrator' } };
  expect(documentCapabilities(team, actor)).toMatchObject({ readPublished: true, readWorking: false, edit: false, publish: false, manageLifecycle: false });
  expect(documentCapabilities(team, { ...actor, memberOfOrganization: false }).readPublished).toBe(false);
  expect(documentCapabilities({ ...team, hasPublishedSnapshot: false }, actor).readPublished).toBe(false);
});
it('removes published access on archive and Trash while retaining authorized Trash management', () => {
  const actor = { id: 'member', role: 'editor' as const, memberOfOrganization: true, grant: { organizationId: 'org', role: 'administrator' } };
  expect(documentCapabilities({ ...team, isArchived: true }, actor).readPublished).toBe(false);
  expect(documentCapabilities({ ...team, deletedAt: new Date() }, actor)).toMatchObject({ readPublished: false, readWorking: false, edit: false, publish: false, manageLifecycle: true });
});
