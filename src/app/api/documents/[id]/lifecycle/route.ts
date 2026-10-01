import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { changeDocumentLifecycle } from '@/lib/document-lifecycle';
import { DocumentWriteError } from '@/lib/document-write';

const inputSchema = z.object({ action: z.enum(['archive', 'unarchive', 'trash', 'restore']), expectedUpdatedAt: z.string().datetime().optional() }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'document.delete')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Invalid lifecycle action' }, { status: 400 });
  const { id } = await params;
  try { return NextResponse.json(await changeDocumentLifecycle(user.id, id, input.data.action, input.data.expectedUpdatedAt)); }
  catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
