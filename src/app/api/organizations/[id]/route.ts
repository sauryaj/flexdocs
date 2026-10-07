import { NextResponse } from 'next/server';
import { deleteOrganization } from '@/lib/organization-administration';
import { DocumentationGrantError } from '@/lib/documentation-grants';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { readVisibleOrganization } from '@/lib/organization-read';
import { DocumentWriteError } from '@/lib/document-write';
import { type UserRole } from '@prisma/client';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  try {
    return NextResponse.json(await readVisibleOrganization(user.id, id), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Unable to load organization' }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(user.role as UserRole, 'organization.update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const { name, description, website, phone, email, address, logo } = await req.json();

  const organization = await prisma.organization.findUnique({
    where: { id },
  });

  if (!organization) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const updated = await prisma.organization.update({
    where: { id },
    data: {
      name,
      description: description || null,
      website: website || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      logo: logo || null,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(user.role as UserRole, 'organization.delete')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try { return NextResponse.json(await deleteOrganization(user.id, id)); }
  catch (error) {
    if (error instanceof DocumentationGrantError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Organization deletion could not be confirmed. Reload before retrying.' }, { status: 500 });
  }
}
