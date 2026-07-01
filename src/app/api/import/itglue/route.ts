import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { importFromItGlue, parseItGlueCsv } from '@/lib/itglue-import';

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, type, organizationId } = await req.json();

  let parsed: Record<string, unknown[]>;

  if (type === 'csv' && typeof data === 'string') {
    parsed = parseItGlueCsv(data);
  } else if (type === 'json' && typeof data === 'object') {
    parsed = data;
  } else {
    return NextResponse.json({ error: 'Invalid format. Use type "csv" or "json"' }, { status: 400 });
  }

  const result = await importFromItGlue(user.id, parsed, organizationId);
  return NextResponse.json(result);
}
