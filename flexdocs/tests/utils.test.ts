import { describe, it, expect } from 'vitest';
import { formatDate, timeAgo, cn } from '@/lib/utils';

describe('formatDate', () => {
  it('formats a valid ISO date string', () => {
    const result = formatDate('2025-01-15T12:00:00.000Z');
    expect(result).toMatch(/Jan/);
    expect(result).toMatch(/2025/);
  });

  it('formats a Date object', () => {
    const result = formatDate(new Date('2025-06-15'));
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/15/);
  });
});

describe('timeAgo', () => {
  it('returns "just now" for recent timestamps', () => {
    const now = new Date().toISOString();
    expect(timeAgo(now)).toMatch(/just now|seconds? ago/);
  });

  it('returns relative time for past dates', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    expect(timeAgo(twoDaysAgo)).toMatch(/2d ago/);
  });
});

describe('cn', () => {
  it('merges class names', () => {
    const result = cn('text-red-500', 'text-blue-500');
    expect(result).toBe('text-blue-500');
  });

  it('handles conditional classes', () => {
    const result = cn('base', false && 'hidden', 'extra');
    expect(result).toContain('base');
    expect(result).toContain('extra');
    expect(result).not.toContain('hidden');
  });
});
