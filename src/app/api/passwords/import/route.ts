import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';
import { parseCsv, detectFormat, mapRow, type VaultFormat } from '@/lib/vault-import';

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'password.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { csv, format, organizationId } = await req.json().catch(() => ({}));
  if (!csv || typeof csv !== 'string' || csv.trim() === '') {
    return NextResponse.json({ error: 'csv content required' }, { status: 400 });
  }

  const rows = parseCsv(csv);
  if (rows.length < 2) {
    return NextResponse.json({ error: 'CSV needs a header row and at least one entry' }, { status: 400 });
  }

  const headers = rows[0];
  const fmt: VaultFormat =
    format === 'bitwarden' || format === '1password' || format === 'chrome' ? format : detectFormat(headers);

  const dataRows = rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h.toLowerCase().replace(/[^a-z0-9]/g, '')] = r[i] ?? '';
    });
    return rec;
  });

  let created = 0;
  let skipped = 0;
  const errors: { index: number; error: string }[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    try {
      const mapped = mapRow(dataRows[i], fmt);
      if (!mapped.name && !mapped.username) {
        skipped++;
        continue;
      }

      // Dedupe on name+username+url
      const existing = await prisma.password.findFirst({
        where: {
          userId: user.id,
          name: mapped.name,
          username: mapped.username,
          ...(mapped.url ? { url: mapped.url } : {}),
        },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }

      await prisma.password.create({
        data: {
          name: mapped.name,
          username: mapped.username,
          password: encrypt(mapped.password),
          url: mapped.url || null,
          notes: mapped.notes || null,
          category: 'imported',
          isFavorite: mapped.isFavorite ?? false,
          totpSecret: mapped.totpSecret ? encrypt(mapped.totpSecret) : null,
          organizationId: organizationId || null,
          userId: user.id,
        },
      });
      created++;
    } catch (err: any) {
      errors.push({ index: i + 2, error: err.message }); // +2 = header + 1-indexed
    }
  }

  return NextResponse.json({
    detectedFormat: fmt,
    total: dataRows.length,
    created,
    skipped,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
  });
}
