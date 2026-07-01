import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const orgs = [
  {
    name: 'Acme Corporation',
    description: 'IT services company providing managed infrastructure and cloud solutions',
    website: 'https://acme.example.com',
    email: 'info@acme.example.com',
    phone: '+1-555-0100',
    address: '123 Tech Blvd, San Francisco, CA 94105',
  },
  {
    name: 'TechStart Inc',
    description: 'Early-stage startup building next-gen developer tools',
    website: 'https://techstart.example.com',
    email: 'hello@techstart.example.com',
    phone: '+1-555-0200',
    address: '456 Startup Lane, Austin, TX 73301',
  },
  {
    name: 'Global Networks LLC',
    description: 'Enterprise networking company specializing in SD-WAN and VPN infrastructure',
    website: 'https://globalnet.example.com',
    email: 'contact@globalnet.example.com',
    phone: '+1-555-0300',
    address: '789 Network Dr, New York, NY 10001',
  },
];

async function main() {
  const createdOrgs = [];
  for (const org of orgs) {
    const created = await prisma.organization.upsert({
      where: { id: org.name.replace(/\s/g, '-').toLowerCase() },
      update: {},
      create: org,
    });
    console.log(`Created org: ${created.name} (${created.id})`);
    createdOrgs.push(created);
  }

  const [org1, org2, org3] = createdOrgs;

  const docs = await prisma.document.findMany({ select: { id: true } });
  for (let i = 0; i < docs.length; i++) {
    const orgId = [org1.id, org2.id, org3.id][i % 3];
    await prisma.document.update({ where: { id: docs[i].id }, data: { organizationId: orgId } });
  }
  console.log(`Assigned ${docs.length} documents`);

  const pwds = await prisma.password.findMany({ select: { id: true } });
  for (let i = 0; i < pwds.length; i++) {
    const orgId = [org1.id, org2.id, org3.id][i % 3];
    await prisma.password.update({ where: { id: pwds[i].id }, data: { organizationId: orgId } });
  }
  console.log(`Assigned ${pwds.length} passwords`);

  const doms = await prisma.domain.findMany({ select: { id: true } });
  for (let i = 0; i < doms.length; i++) {
    const orgId = [org1.id, org2.id, org3.id][i % 3];
    await prisma.domain.update({ where: { id: doms[i].id }, data: { organizationId: orgId } });
  }
  console.log(`Assigned ${doms.length} domains`);

  console.log('\n--- Organization IDs ---');
  for (const org of createdOrgs) {
    console.log(`${org.name}: ${org.id}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
