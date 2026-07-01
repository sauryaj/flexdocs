import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';

export interface PasswordHealthReport {
  totalPasswords: number;
  weakPasswords: number;
  reusedPasswords: number;
  oldPasswords: number;
  expiringPasswords: number;
  breachedPasswords: number;
  withTotp: number;
  withoutTotp: number;
  avgAge: number; // days
  weakest: { name: string; score: number }[];
  oldest: { name: string; daysOld: number }[];
  reused: { name: string; count: number }[];
  expiring: { name: string; daysUntilExpiry: number }[];
}

export async function generatePasswordHealth(userId: string): Promise<PasswordHealthReport> {
  const passwords = await prisma.password.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });

  const now = new Date();
  const decrypted = passwords.map((p) => ({
    ...p,
    password: decrypt(p.password),
  }));

  // Count weak (breachCount > 0 or short)
  const weakPasswords = decrypted.filter((p) => p.password.length < 12 || p.breachCount > 0).length;

  // Count reused
  const passwordMap = new Map<string, string[]>();
  for (const p of decrypted) {
    const existing = passwordMap.get(p.password) || [];
    existing.push(p.name);
    passwordMap.set(p.password, existing);
  }
  const reusedEntries = Array.from(passwordMap.entries()).filter(([, names]) => names.length > 1);
  const reusedPasswords = reusedEntries.reduce((sum, [, names]) => sum + names.length, 0);

  // Count old (not updated in 90+ days)
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const oldPasswords = decrypted.filter((p) => p.updatedAt < ninetyDaysAgo).length;

  // Count expiring (within 30 days)
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const expiringPasswords = decrypted.filter((p) =>
    p.expiresAt && p.expiresAt < thirtyDaysFromNow && p.expiresAt > now
  ).length;

  // Count breached
  const breachedPasswords = decrypted.filter((p) => p.breachCount > 0).length;

  // TOTP stats
  const withTotp = decrypted.filter((p) => p.totpSecret).length;
  const withoutTotp = decrypted.length - withTotp;

  // Average age
  const avgAge = decrypted.length > 0
    ? decrypted.reduce((sum, p) => sum + (now.getTime() - p.createdAt.getTime()) / (1000 * 60 * 60 * 24), 0) / decrypted.length
    : 0;

  // Weakest 5
  const weakest = decrypted
    .map((p) => ({ name: p.name, score: p.password.length < 8 ? 10 : p.password.length < 12 ? 30 : p.breachCount > 0 ? 20 : 70 }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  // Oldest 5
  const oldest = decrypted
    .map((p) => ({ name: p.name, daysOld: Math.floor((now.getTime() - p.createdAt.getTime()) / (1000 * 60 * 60 * 24)) }))
    .sort((a, b) => b.daysOld - a.daysOld)
    .slice(0, 5);

  // Reused groups
  const reused = reusedEntries.map(([, names]) => ({ name: names.join(', '), count: names.length }));

  // Expiring soon
  const expiring = decrypted
    .filter((p) => p.expiresAt && p.expiresAt > now)
    .map((p) => ({ name: p.name, daysUntilExpiry: Math.floor((p.expiresAt!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) }))
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
    .slice(0, 10);

  return {
    totalPasswords: passwords.length,
    weakPasswords,
    reusedPasswords,
    oldPasswords,
    expiringPasswords,
    breachedPasswords,
    withTotp,
    withoutTotp,
    avgAge: Math.floor(avgAge),
    weakest,
    oldest,
    reused,
    expiring,
  };
}
