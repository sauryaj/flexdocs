import { expect, it } from 'vitest';
import { searchEntities } from '@/lib/search-results';
import { invitationAcceptance, invitationHash, invitationRequest } from '@/lib/invitations';

it('parses current grouped search responses without treating groups as records', () => {
  expect(searchEntities({ query: 'guide', groups: [
    { type: 'documents', items: [{ id: 'doc', title: 'Guide' }] },
    { type: 'passwords', items: [{ id: 'pw', title: 'Server' }] },
    { type: 'tickets', items: [{ id: '1', title: 'Ticket' }] },
    { type: 'documents', items: [{ title: 'Missing id' }, null] },
  ] })).toEqual([{ id: 'doc', name: 'Guide', type: 'document' }, { id: 'pw', name: 'Server', type: 'password' }]);
});
it('ignores malformed search responses', () => {
  for (const data of [null, {}, { groups: ['bad', null, { type: 'unknown', items: [] }] }]) expect(searchEntities(data)).toEqual([]);
});
it('normalizes invitation addresses and rejects unknown roles', () => {
  expect(invitationRequest.parse({ email: '  Person@Example.com  ' }).email).toBe('person@example.com');
  expect(invitationRequest.safeParse({ email: 'person@example.com', role: 'root' }).success).toBe(false);
});
it('keeps invitation tokens hashed and enforces password and token input contracts', () => {
  const token = 'a'.repeat(64);
  expect(invitationHash(token)).not.toBe(token);
  expect(invitationAcceptance.safeParse({ token, name: 'Person', password: 'short' }).success).toBe(false);
  expect(invitationAcceptance.safeParse({ token: '../bad' }).success).toBe(false);
  expect(invitationAcceptance.safeParse({ token }).success).toBe(true);
});
