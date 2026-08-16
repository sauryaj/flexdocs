import { NextResponse } from 'next/server';
import { createBackup, listBackups } from '@/lib/backup';
import { auth } from '@/lib/auth';

export async function GET() {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const backups = listBackups().map((b) => ({
    id: b.name,
    filename: b.name,
    size: b.size,
    type: 'full' as const,
    status: 'completed' as const,
    createdAt: b.created,
  }));
  return NextResponse.json(backups);
}

export async function POST() {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const filepath = createBackup();
    const filename = filepath.split('/').pop() || 'backup';
    return NextResponse.json({ success: true, filename, filepath });
  } catch {
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 });
  }
}