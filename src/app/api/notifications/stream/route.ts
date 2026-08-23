import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

const TICK_MS = 8000;
const HEARTBEAT_MS = 15000;

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return new Response('Unauthorized', { status: 401 });
  const userId = user.id;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let lastSig = '';
      const lastActivity = Date.now();

      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const tick = async () => {
        if (closed) return;
        try {
          const [unreadCount, latest] = await Promise.all([
            prisma.notification.count({ where: { userId, read: false } }),
            prisma.notification.findFirst({
              where: { userId },
              orderBy: { createdAt: 'desc' },
              select: { id: true, createdAt: true },
            }),
          ]);
          const sig = `${unreadCount}:${latest?.id || ''}`;
          if (sig !== lastSig) {
            lastSig = sig;
            send({ unreadCount, latestId: latest?.id || null });
          }
        } catch (err) {
          // Transient DB errors: keep the stream alive
          logger.debug('SSE tick failed', { err });
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(tickTimer);
        clearInterval(hbTimer);
        try {
          controller.close();
        } catch {
          // already closed by the runtime
        }
      };

      // Initial state
      tick();

      const tickTimer = setInterval(() => {
        void tick();
        // Auto-close idle streams after 5 minutes; EventSource reconnects automatically
        if (Date.now() - lastActivity > 5 * 60 * 1000) {
          send({ bye: true });
          cleanup();
        }
      }, TICK_MS);

      const hbTimer = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_MS);

      req.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
