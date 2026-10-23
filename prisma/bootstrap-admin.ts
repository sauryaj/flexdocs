import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { bootstrapPassword } from '../src/lib/bootstrap-admin';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@flexdocs.local';
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    console.log('Existing admin preserved');
    return;
  }

  await prisma.user.create({
    data: {
      name: 'System Admin',
      email,
      role: 'admin',
      password: await bcrypt.hash(bootstrapPassword(), 12),
    },
  });
  console.log('Bootstrap admin created');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
