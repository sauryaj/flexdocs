import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { reportToCsv, type ReportData } from '@/lib/compliance';

const fixture: ReportData = {
  generatedAt: '2026-08-16T00:00:00.000Z',
  summary: {
    totalDocuments: 3,
    totalPasswords: 2,
    totalDomains: 1,
    totalAssets: 0,
    totalChecklists: 4,
    totalSslCerts: 5,
  },
  domainExpiry: [
    {
      name: 'company.com',
      expiresAt: '2026-12-15T00:00:00.000Z',
      status: 'active',
      registrar: 'Cloudflare',
      daysUntilExpiry: 121,
    },
    { name: 'old.io', expiresAt: null, status: 'expired', registrar: null, daysUntilExpiry: null },
  ],
  passwordAge: [
    {
      name: 'Prod SSH',
      username: 'root',
      category: 'ssh',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      daysOld: 15,
    },
  ],
  sslCertificates: [],
  recentActivity: [],
};

describe('reportToCsv', () => {
  it('includes the summary metrics', () => {
    const csv = reportToCsv(fixture);
    expect(csv).toContain('Documents,3');
    expect(csv).toContain('Passwords,2');
    expect(csv).toContain('SSL Certificates,5');
  });

  it('quotes domain rows and falls back to N/A for nulls', () => {
    const csv = reportToCsv(fixture);
    expect(csv).toContain('"company.com","2026-12-15T00:00:00.000Z","active","Cloudflare","121"');
    expect(csv).toContain('"old.io","N/A","expired","N/A","N/A"');
  });

  it('includes password age rows with numeric days', () => {
    const csv = reportToCsv(fixture);
    expect(csv).toContain('"Prod SSH","root","ssh"');
    expect(csv).toMatch(/"Prod SSH",.*\b15\b/);
  });

  it('produces section headers in order', () => {
    const csv = reportToCsv(fixture);
    const summaryIdx = csv.indexOf('=== Summary ===');
    const domainIdx = csv.indexOf('=== Domain Expiry ===');
    const passwordIdx = csv.indexOf('=== Password Age ===');
    expect(summaryIdx).toBeGreaterThanOrEqual(0);
    expect(domainIdx).toBeGreaterThan(summaryIdx);
    expect(passwordIdx).toBeGreaterThan(domainIdx);
  });
});
