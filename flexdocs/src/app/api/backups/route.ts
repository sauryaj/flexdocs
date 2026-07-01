import { NextResponse } from 'next/server';
import { createBackup, listBackups } from '@/lib/backup';
import { auth } from '@/lib/auth';

export async function GET() {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const backups = listBackups();
  return NextResponse.json(backups);
}

export async function POST() {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const filepath = createBackup();
    return NextResponse.json({ success: true, filepath });
  } catch {
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 });
  }
}
