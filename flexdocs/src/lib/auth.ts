import { prisma } from '@/lib/prisma';

// Get the first user (single-user mode, no auth required)
async function getDefaultUser() {
  return prisma.user.findFirst();
}

export { getDefaultUser as auth };
