import { createHmac, randomBytes } from 'crypto';

// TOTP implementation (RFC 6238)
// Compatible with Google Authenticator, Authy, etc.

export function generateTotpSecret(length = 20): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';
  const bytes = randomBytes(length);
  for (let i = 0; i < length; i++) {
    secret += chars[bytes[i] % chars.length];
  }
  return secret;
}

export function base32Decode(encoded: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = encoded.replace(/[^A-Z2-7]/gi, '').toUpperCase();
  let bits = '';
  for (const char of cleaned) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = Buffer.alloc(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

export function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let encoded = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    encoded += alphabet[parseInt(chunk, 2)];
  }
  return encoded;
}

function intToBytes(num: number): Buffer {
  const bytes = Buffer.alloc(8);
  let temp = num;
  for (let i = 7; i >= 0; i--) {
    bytes[i] = temp & 0xff;
    temp = Math.floor(temp / 256);
  }
  return bytes;
}

export function generateTotp(
  secret: string,
  time = Math.floor(Date.now() / 1000),
  period = 30,
  digits = 6
): string {
  const key = base32Decode(secret);
  const timeStep = Math.floor(time / period);
  const timeBytes = intToBytes(timeStep);

  const hmac = createHmac('sha1', key).update(timeBytes).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % Math.pow(10, digits);

  return code.toString().padStart(digits, '0');
}

export function verifyTotp(
  secret: string,
  token: string,
  window = 1,
  period = 30,
  digits = 6
): boolean {
  const time = Math.floor(Date.now() / 1000);

  // Check current and adjacent time windows
  for (let i = -window; i <= window; i++) {
    const expected = generateTotp(secret, time + i * period, period, digits);
    if (expected === token) return true;
  }

  return false;
}

export function getKeyUri(
  secret: string,
  accountName: string,
  issuer: string,
  period = 30,
  digits = 6
): string {
  const encodedSecret = base32Encode(base32Decode(secret));
  const params = new URLSearchParams({
    secret: encodedSecret,
    issuer,
    algorithm: 'SHA1',
    digits: String(digits),
    period: String(period),
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?${params.toString()}`;
}
