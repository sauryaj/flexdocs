import { createHash } from 'crypto';

// HaveIBeenPwned k-anonymity API
// See: https://haveibeenpwned.com/API/v3#k-anonymity
const HIBP_API = 'https://api.pwnedpasswords.com/range';

export interface BreachCheckResult {
  breached: boolean;
  count: number;
  checkedAt: string;
}

export async function checkPasswordBreach(password: string): Promise<BreachCheckResult> {
  try {
    // SHA-1 hash of the password
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();

    // k-anonymity: send only first 5 chars of hash
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const response = await fetch(`${HIBP_API}/${prefix}`, {
      headers: { 'Add-Padding': 'true' }, // Adds padding to prevent timing attacks
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HIBP API returned ${response.status}`);
    }

    const text = await response.text();
    const lines = text.split('\n');

    for (const line of lines) {
      const [hashSuffix, count] = line.split(':');
      if (hashSuffix?.trim() === suffix) {
        return {
          breached: true,
          count: parseInt(count?.trim() || '0', 10),
          checkedAt: new Date().toISOString(),
        };
      }
    }

    return { breached: false, count: 0, checkedAt: new Date().toISOString() };
  } catch {
    // If HIBP is unreachable, return safe default
    return { breached: false, count: 0, checkedAt: new Date().toISOString() };
  }
}

export async function checkMultiplePasswords(passwords: string[]): Promise<Map<string, BreachCheckResult>> {
  const results = new Map<string, BreachCheckResult>();

  for (const password of passwords) {
    const result = await checkPasswordBreach(password);
    results.set(password, result);
  }

  return results;
}
