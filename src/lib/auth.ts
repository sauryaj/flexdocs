import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function auth() {
  try {
    const cookieStore = await cookies();
    const sessionUserId = cookieStore.get('flexdocs_session')?.value;

    if (sessionUserId) {
      const user = await prisma.user.findUnique({
        where: { id: sessionUserId },
      });
      if (user) return user;
    }

    // Fallback to first user for seamless operations if session not yet set
    return prisma.user.findFirst();
  } catch {
    return prisma.user.findFirst();
  }
}
