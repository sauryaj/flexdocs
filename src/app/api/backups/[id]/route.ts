import { NextResponse } from 'next/server';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { auth } from '@/lib/auth';

const BACKUP_DIR = process.env.BACKUP_DIR || '/backups';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const name = /^flexdocs-backup-[\w-]+\.sql$/.test(id) ? id : null;
  if (!name) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const filepath = join(BACKUP_DIR, name);
  if (!existsSync(filepath)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  unlinkSync(filepath);
  return NextResponse.json({ success: true });
}