import { NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { auth } from '@/lib/auth';

const BACKUP_DIR = process.env.BACKUP_DIR || '/backups';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const name = /^flexdocs-backup-[\w-]+\.sql$/.test(id) ? id : null;
  if (!name) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const filepath = join(BACKUP_DIR, name);
  if (!existsSync(filepath)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data = readFileSync(filepath);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': 'application/sql',
      'Content-Disposition': `attachment; filename="${name}"`,
    },
  });
}