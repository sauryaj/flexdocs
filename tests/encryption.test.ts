import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '@/lib/encryption';

describe('encryption', () => {
  it('encrypts and decrypts a string', () => {
    const plaintext = 'my-secret-password-123';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext for same plaintext (random IV)', () => {
    const plaintext = 'same-input';
    const enc1 = encrypt(plaintext);
    const enc2 = encrypt(plaintext);
    expect(enc1).not.toBe(enc2);
  });

  it('decrypts to original value', () => {
    const original = 'test-value-with-special-chars!@#$%^&*()';
    expect(decrypt(encrypt(original))).toBe(original);
  });
});
