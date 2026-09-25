import { expect, it } from 'vitest';
import { bootstrapPassword } from '@/lib/bootstrap-admin';
it.each([undefined, '', 'admin12345', 'generate-a-unique-password-here'])('rejects missing or unsafe bootstrap password %s', password => {
  expect(() => bootstrapPassword({ BOOTSTRAP_ADMIN_PASSWORD: password })).toThrow('BOOTSTRAP_ADMIN_PASSWORD');
});
it('accepts an explicitly configured bootstrap password', () => {
  expect(bootstrapPassword({ BOOTSTRAP_ADMIN_PASSWORD: 'isolated-test-admin-1234' })).toBe('isolated-test-admin-1234');
});
