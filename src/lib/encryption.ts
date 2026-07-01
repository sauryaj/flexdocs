import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || '';
  if (!secret) {
    throw new Error('ENCRYPTION_KEY or NEXTAUTH_SECRET must be set');
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
  // Check if it's already encrypted (contains two colons with hex parts)
  const parts = ciphertext.split(':');
  if (parts.length !== 3) return ciphertext; // Not encrypted, return as-is

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
    return ciphertext; // Decryption failed, return as-is (backward compat)
  }
}

export function hashForSearch(plaintext: string): string {
  // Deterministic hash for searching encrypted fields
  const key = getEncryptionKey();
  return crypto.createHmac('sha256', key).update(plaintext.toLowerCase().trim()).digest('hex');
}
