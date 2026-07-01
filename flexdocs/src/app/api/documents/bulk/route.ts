import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action, ids, data } = await request.json();

  switch (action) {
    case 'delete': {
      await prisma.document.deleteMany({ where: { id: { in: ids }, userId: user.id } });
      break;
    }
    case 'move': {
      await prisma.document.updateMany({
        where: { id: { in: ids }, userId: user.id },
        data: { folderId: data.folderId },
      });
      break;
    }
    case 'tag': {
      for (const id of ids) {
        await prisma.document.update({
          where: { id },
          data: { tags: { connect: { id: data.tagId } } },
        });
      }
      break;
    }
    case 'untag': {
      for (const id of ids) {
        await prisma.document.update({
          where: { id },
          data: { tags: { disconnect: { id: data.tagId } } },
        });
      }
      break;
    }
    case 'archive': {
      await prisma.document.updateMany({
        where: { id: { in: ids }, userId: user.id },
        data: { isArchived: true },
      });
      break;
    }
    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  return NextResponse.json({ success: true, affected: ids.length });
}
