import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY must be set — refusing to derive key from other secrets');
  }
  const salt = process.env.ENCRYPTION_SALT || 'flexdocs-salt-v1';
  return crypto.pbkdf2Sync(secret, salt, ITERATIONS, KEY_LENGTH, 'sha512');
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ciphertext;
  // Legacy plaintext or non-standard values are returned as-is for backward compat
  const parts = ciphertext.split(':');
  if (parts.length !== 3) return ciphertext;

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch {
    // Surface key-rotation or tampering issues instead of leaking ciphertext
    throw new Error('Failed to decrypt value: invalid ciphertext or encryption key mismatch');
  }
}

export function hashForSearch(plaintext: string): string {
  // Deterministic hash for searching encrypted fields
  const key = getEncryptionKey();
  return crypto.createHmac('sha256', key).update(plaintext.toLowerCase().trim()).digest('hex');
}
