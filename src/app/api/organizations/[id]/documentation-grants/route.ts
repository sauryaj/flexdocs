import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { changeDocumentationGrant, DocumentationGrantError, listDocumentationGrants } from '@/lib/documentation-grants';

const schema = z.object({ userId: z.string().min(1).max(255), role: z.enum(['reader', 'contributor', 'reviewer', 'administrator']).nullable() }).strict();
type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Context) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'document.read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    return NextResponse.json(await listDocumentationGrants(user.id, (await params).id));
  } catch (error) {
    if (error instanceof DocumentationGrantError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function PUT(req: Request, { params }: Context) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'document.update')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const input = schema.safeParse(await req.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Invalid documentation grant' }, { status: 400 });
  try {
    const grant = await changeDocumentationGrant(user.id, (await params).id, input.data.userId, input.data.role);
    return NextResponse.json({ success: true, grant });
  } catch (error) {
    if (error instanceof DocumentationGrantError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
