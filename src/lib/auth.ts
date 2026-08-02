import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { COOKIE_NAME, verifySessionToken } from '@/lib/session';

export async function auth() {
  try {
    const cookieStore = await cookies();
    const signed = cookieStore.get(COOKIE_NAME)?.value;

    if (!signed) return null;

    const token = verifySessionToken(signed);
    if (!token) return null;

    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session) return null;

    // Update lastActive periodically (avoid a write on every request)
    const stale = Date.now() - session.lastActive.getTime() > 5 * 60 * 1000;
    if (stale) {
      prisma.session.update({
        where: { id: session.id },
        data: { lastActive: new Date() },
      }).catch(() => {});
    }

    return session.user;
  } catch {
    return null;
  }
}
