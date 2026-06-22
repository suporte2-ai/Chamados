const prisma = require('../src/lib/prisma');

async function main() {
  const counts = {
    Roles: await prisma.role.count(),
    Sectors: await prisma.sector.count(),
    Categories: await prisma.category.count(),
    SlaConfigs: await prisma.slaConfig.count(),
    Users: await prisma.user.count(),
    Tickets: await prisma.ticket.count(),
    Ideas: await prisma.idea.count(),
  };

  console.log(counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
