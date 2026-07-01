import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';
import { autoDetectAndParse } from '@/lib/password-import';

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, format, organizationId } = await req.json();

  if (!data) return NextResponse.json({ error: 'data required' }, { status: 400 });

  let passwords;
  if (format === 'json') {
    try {
      passwords = typeof data === 'string' ? JSON.parse(data) : data;
      if (!Array.isArray(passwords)) passwords = passwords.passwords || [];
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  } else {
    passwords = autoDetectAndParse(data);
  }

  let imported = 0;
  const errors: string[] = [];

  for (const p of passwords) {
    try {
      await prisma.password.create({
        data: {
          name: p.name || 'Untitled',
          username: p.username || '',
          password: encrypt(p.password),
          url: p.url || null,
          notes: p.notes || null,
          category: p.category || 'general',
          totpSecret: p.totpSecret ? encrypt(p.totpSecret) : null,
          userId: user.id,
          organizationId: organizationId || null,
        },
      });
      imported++;
    } catch (err) {
      errors.push(`${p.name}: ${String(err)}`);
    }
  }

  return NextResponse.json({ imported, total: passwords.length, errors });
}
