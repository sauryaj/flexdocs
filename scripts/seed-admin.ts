import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { bootstrapPassword } from '../src/lib/bootstrap-admin';

const prisma = new PrismaClient();

async function seedAdmin() {
  const email = 'admin@flexdocs.local';
  const existing = await prisma.user.findUnique({ where: { email } });
  const user = existing ?? await prisma.user.create({
    data: { name: 'System Admin', email, password: await bcrypt.hash(bootstrapPassword(), 12), role: 'admin' },
  });

  console.log(`Admin user ready: ${user.email} (${user.id})`);
}

seedAdmin()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
