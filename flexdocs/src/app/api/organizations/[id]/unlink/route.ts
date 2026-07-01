import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const VALID_TYPES = ['document', 'password', 'domain', 'asset', 'checklist', 'folder'];

async function unlinkResource(resourceType: string, resourceId: string, organizationId: string, userId: string) {
  switch (resourceType) {
    case 'document': {
      const r = await prisma.document.findUnique({ where: { id: resourceId } });
      if (!r || r.userId !== userId) return null;
      if (r.organizationId !== organizationId) return { error: 'not_linked' };
      return prisma.document.update({ where: { id: resourceId }, data: { organizationId: null } });
    }
    case 'password': {
      const r = await prisma.password.findUnique({ where: { id: resourceId } });
      if (!r || r.userId !== userId) return null;
      if (r.organizationId !== organizationId) return { error: 'not_linked' };
      return prisma.password.update({ where: { id: resourceId }, data: { organizationId: null } });
    }
    case 'domain': {
      const r = await prisma.domain.findUnique({ where: { id: resourceId } });
      if (!r || r.userId !== userId) return null;
      if (r.organizationId !== organizationId) return { error: 'not_linked' };
      return prisma.domain.update({ where: { id: resourceId }, data: { organizationId: null } });
    }
    case 'asset': {
      const r = await prisma.flexibleAsset.findUnique({ where: { id: resourceId } });
      if (!r || r.userId !== userId) return null;
      if (r.organizationId !== organizationId) return { error: 'not_linked' };
      return prisma.flexibleAsset.update({ where: { id: resourceId }, data: { organizationId: null } });
    }
    case 'checklist': {
      const r = await prisma.checklist.findUnique({ where: { id: resourceId } });
      if (!r || r.userId !== userId) return null;
      if (r.organizationId !== organizationId) return { error: 'not_linked' };
      return prisma.checklist.update({ where: { id: resourceId }, data: { organizationId: null } });
    }
    case 'folder': {
      const r = await prisma.folder.findUnique({ where: { id: resourceId } });
      if (!r || r.userId !== userId) return null;
      if (r.organizationId !== organizationId) return { error: 'not_linked' };
      return prisma.folder.update({ where: { id: resourceId }, data: { organizationId: null } });
    }
    default:
      return null;
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { resourceType, resourceId } = await req.json();

  if (!resourceType || !VALID_TYPES.includes(resourceType)) {
    return NextResponse.json({ error: 'Invalid resourceType' }, { status: 400 });
  }
  if (!resourceId) {
    return NextResponse.json({ error: 'Missing resourceId' }, { status: 400 });
  }

  const organization = await prisma.organization.findUnique({ where: { id } });
  if (!organization) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const result = await unlinkResource(resourceType, resourceId, id, user.id);
  if (!result) {
    return NextResponse.json({ error: 'Resource not found or forbidden' }, { status: 404 });
  }
  if ('error' in result && result.error === 'not_linked') {
    return NextResponse.json({ error: 'Resource is not linked to this organization' }, { status: 400 });
  }

  return NextResponse.json(result);
}
