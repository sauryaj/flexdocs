import crypto from 'crypto';

const DIGITS = 6;
const PERIOD = 30;
const ALGO = 'sha1';

function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let result = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    result += alphabet[parseInt(chunk, 2)];
  }
  return result;
}

function base32Decode(str: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of str.toUpperCase()) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function generateToken(secret: string): string {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / PERIOD);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter & 0xffffffff, 4);
  const hmac = crypto.createHmac(ALGO, key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return (code % Math.pow(10, DIGITS)).toString().padStart(DIGITS, '0');
}

export function verifyToken(secret: string, token: string): boolean {
  // Check current and one period before/after for clock skew
  for (const offset of [-1, 0, 1]) {
    const key = base32Decode(secret);
    const counter = Math.floor(Date.now() / 1000 / PERIOD) + offset;
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    counterBuf.writeUInt32BE(counter & 0xffffffff, 4);
    const hmac = crypto.createHmac(ALGO, key).update(counterBuf).digest();
    const off = hmac[hmac.length - 1] & 0x0f;
    const code = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3];
    const expected = (code % Math.pow(10, DIGITS)).toString().padStart(DIGITS, '0');
    if (expected === token) return true;
  }
  return false;
}

export function getKeyUri(issuer: string, account: string, secret: string): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(account);
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD}`;
}
