import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';

export interface ImportResult {
  documents: number;
  passwords: number;
  domains: number;
  assets: number;
  errors: string[];
}

export async function importFromItGlue(
  userId: string,
  data: Record<string, unknown>,
  organizationId?: string
): Promise<ImportResult> {
  const result: ImportResult = { documents: 0, passwords: 0, domains: 0, assets: 0, errors: [] };

  // Import documents
  if (Array.isArray(data.documents)) {
    for (const doc of data.documents) {
      try {
        await prisma.document.create({
          data: {
            title: doc.title || 'Untitled',
            content: doc.content || '',
            category: doc.category || 'imported',
            userId,
            organizationId: organizationId || null,
          },
        });
        result.documents++;
      } catch (err) {
        result.errors.push(`Document "${doc.title}": ${String(err)}`);
      }
    }
  }

  // Import passwords
  if (Array.isArray(data.passwords)) {
    for (const pass of data.passwords) {
      try {
        const { encrypt } = await import('@/lib/encryption');
        await prisma.password.create({
          data: {
            name: pass.name || 'Untitled',
            username: pass.username || '',
            password: encrypt(pass.password || ''),
            url: pass.url || null,
            notes: pass.notes || null,
            category: pass.category || 'imported',
            userId,
            organizationId: organizationId || null,
          },
        });
        result.passwords++;
      } catch (err) {
        result.errors.push(`Password "${pass.name}": ${String(err)}`);
      }
    }
  }

  // Import domains
  if (Array.isArray(data.domains)) {
    for (const dom of data.domains) {
      try {
        await prisma.domain.create({
          data: {
            name: dom.name || '',
            registrar: dom.registrar || null,
            nameservers: dom.nameservers || null,
            expiresAt: dom.expiresAt ? new Date(dom.expiresAt) : null,
            autoRenew: dom.autoRenew !== false,
            status: dom.status || 'active',
            notes: dom.notes || null,
            userId,
            organizationId: organizationId || null,
          },
        });
        result.domains++;
      } catch (err) {
        result.errors.push(`Domain "${dom.name}": ${String(err)}`);
      }
    }
  }

  // Import flexible assets
  if (Array.isArray(data.assets)) {
    for (const asset of data.assets) {
      try {
        await prisma.flexibleAsset.create({
          data: {
            name: asset.name || 'Untitled',
            assetType: asset.assetType || 'general',
            fields: JSON.stringify(asset.fields || {}),
            notes: asset.notes || null,
            userId,
            organizationId: organizationId || null,
          },
        });
        result.assets++;
      } catch (err) {
        result.errors.push(`Asset "${asset.name}": ${String(err)}`);
      }
    }
  }

  logger.info('IT Glue import completed', { userId, ...result });
  return result;
}

export function parseItGlueCsv(csvText: string): Record<string, unknown[]> {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return { documents: [], passwords: [], domains: [], assets: [] };

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
    rows.push(row);
  }

  // Try to categorize by common column patterns
  const documents: Record<string, unknown>[] = [];
  const passwords: Record<string, unknown>[] = [];
  const domains: Record<string, unknown>[] = [];

  for (const row of rows) {
    const keys = Object.keys(row);
    if (keys.some((k) => k.includes('domain') || k.includes('expiry'))) {
      domains.push(row);
    } else if (keys.some((k) => k.includes('password') || k.includes('credential'))) {
      passwords.push(row);
    } else {
      documents.push(row);
    }
  }

  return { documents, passwords, domains, assets: [] };
}
