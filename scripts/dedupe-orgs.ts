import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function dedupe() {
  const allOrgs = await prisma.organization.findMany({
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Total organizations found: ${allOrgs.length}`);

  // Desired 3 target names
  const targetNames = ['Acme Corporation', 'TechStart Inc', 'Global Networks LLC'];

  // Map to hold kept org for each name
  const keptOrgs: Record<string, string> = {};

  for (const targetName of targetNames) {
    const matches = allOrgs.filter(
      (o) => o.name.toLowerCase().trim() === targetName.toLowerCase().trim()
    );

    if (matches.length > 0) {
      const primary = matches[0];
      keptOrgs[targetName] = primary.id;
      console.log(`Keeping primary for "${targetName}": ${primary.id}`);

      // Reassign duplicates to primary
      const duplicates = matches.slice(1);
      for (const dup of duplicates) {
        console.log(`Reassigning resources from duplicate org ${dup.id} to ${primary.id}...`);

        await prisma.document.updateMany({ where: { organizationId: dup.id }, data: { organizationId: primary.id } });
        await prisma.password.updateMany({ where: { organizationId: dup.id }, data: { organizationId: primary.id } });
        await prisma.domain.updateMany({ where: { organizationId: dup.id }, data: { organizationId: primary.id } });
        await prisma.flexibleAsset.updateMany({ where: { organizationId: dup.id }, data: { organizationId: primary.id } });
        await prisma.checklist.updateMany({ where: { organizationId: dup.id }, data: { organizationId: primary.id } });
        await prisma.folder.updateMany({ where: { organizationId: dup.id }, data: { organizationId: primary.id } });
        await prisma.server.updateMany({ where: { organizationId: dup.id }, data: { organizationId: primary.id } });
        await prisma.networkDocument.updateMany({ where: { organizationId: dup.id }, data: { organizationId: primary.id } });
        await prisma.sslCertificate.updateMany({ where: { organizationId: dup.id }, data: { organizationId: primary.id } });

        await prisma.organization.delete({ where: { id: dup.id } });
        console.log(`Deleted duplicate org ${dup.id}`);
      }
    }
  }

  // Delete any other orgs not in the target names list
  const remaining = await prisma.organization.findMany();
  for (const org of remaining) {
    const isTarget = targetNames.some((t) => t.toLowerCase().trim() === org.name.toLowerCase().trim());
    if (!isTarget) {
      // Reassign resources to first kept org
      const fallbackId = Object.values(keptOrgs)[0];
      if (fallbackId) {
        await prisma.document.updateMany({ where: { organizationId: org.id }, data: { organizationId: fallbackId } });
        await prisma.password.updateMany({ where: { organizationId: org.id }, data: { organizationId: fallbackId } });
        await prisma.domain.updateMany({ where: { organizationId: org.id }, data: { organizationId: fallbackId } });
        await prisma.flexibleAsset.updateMany({ where: { organizationId: org.id }, data: { organizationId: fallbackId } });
        await prisma.checklist.updateMany({ where: { organizationId: org.id }, data: { organizationId: fallbackId } });
        await prisma.folder.updateMany({ where: { organizationId: org.id }, data: { organizationId: fallbackId } });
        await prisma.server.updateMany({ where: { organizationId: org.id }, data: { organizationId: fallbackId } });
        await prisma.networkDocument.updateMany({ where: { organizationId: org.id }, data: { organizationId: fallbackId } });
        await prisma.sslCertificate.updateMany({ where: { organizationId: org.id }, data: { organizationId: fallbackId } });
      }
      await prisma.organization.delete({ where: { id: org.id } });
      console.log(`Deleted extra non-target org: ${org.name} (${org.id})`);
    }
  }

  const finalOrgs = await prisma.organization.findMany();
  console.log(`\nCleanup complete! Remaining organizations count: ${finalOrgs.length}`);
  finalOrgs.forEach((o) => console.log(`- ${o.name} (${o.id})`));
}

dedupe()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
