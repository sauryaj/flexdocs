import { describe, it, expect } from 'vitest';
import { formatDate, getDaysUntilExpiry } from '@/lib/utils';

describe('formatDate', () => {
  it('formats a date as en-US short month', () => {
    const d = new Date(2026, 7, 16);
    expect(formatDate(d)).toMatch(/Aug 16, 2026/);
  });

  it('accepts ISO strings', () => {
    const local = new Date(2026, 0, 5).toISOString();
    expect(formatDate(local)).toMatch(/Jan (4|5|6), 2026/);
  });
});

describe('getDaysUntilExpiry', () => {
  it('returns positive days for future dates', () => {
    const in30Days = new Date(Date.now() + 30 * 86400000);
    const days = getDaysUntilExpiry(in30Days);
    expect(days).toBeGreaterThanOrEqual(29);
    expect(days).toBeLessThanOrEqual(31);
  });

  it('returns negative days for past dates', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000);
    expect(getDaysUntilExpiry(tenDaysAgo)).toBeLessThanOrEqual(-9);
  });

  it('accepts strings', () => {
    const iso = new Date(Date.now() + 86400000).toISOString();
    expect(getDaysUntilExpiry(iso)).toBeGreaterThanOrEqual(0);
  });
});
