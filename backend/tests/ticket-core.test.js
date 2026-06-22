const prisma = require('../src/lib/prisma');

let sector;
let role;
let requester;

beforeAll(async () => {
  sector = await prisma.sector.create({ data: { name: 'Sector Teste Core' } });
  role = await prisma.role.create({ data: { name: 'Role Teste Core', level: 1 } });
  requester = await prisma.user.create({
    data: {
      name: 'Solicitante Teste',
      email: 'solicitante.core@example.com',
      passwordHash: 'hash',
      roleId: role.id,
      sectorId: sector.id,
    },
  });
});

afterAll(async () => {
  await prisma.ticket.deleteMany();
  await prisma.subcategory.deleteMany();
  await prisma.category.deleteMany();
  await prisma.slaConfig.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.sector.deleteMany();
  await prisma.$disconnect();
});

test('creates a category with subcategories', async () => {
  const category = await prisma.category.create({
    data: {
      name: 'TI Teste',
      subcategories: { create: [{ name: 'Hardware Teste' }, { name: 'Software Teste' }] },
    },
    include: { subcategories: true },
  });

  expect(category.subcategories).toHaveLength(2);
});

test('enforces unique subcategory name within the same category', async () => {
  const category = await prisma.category.create({ data: { name: 'RH Teste' } });
  await prisma.subcategory.create({ data: { categoryId: category.id, name: 'Admissão Teste' } });

  await expect(
    prisma.subcategory.create({ data: { categoryId: category.id, name: 'Admissão Teste' } })
  ).rejects.toThrow();
});

test('creates an SLA config per urgency and enforces uniqueness', async () => {
  await prisma.slaConfig.create({ data: { urgency: 'CRITICO', firstResponseHours: 1, resolutionHours: 4 } });

  await expect(
    prisma.slaConfig.create({ data: { urgency: 'CRITICO', firstResponseHours: 2, resolutionHours: 6 } })
  ).rejects.toThrow();
});

test('creates a ticket with default status ABERTO and required relations', async () => {
  const category = await prisma.category.create({
    data: { name: 'Financeiro Teste', subcategories: { create: [{ name: 'Pagamentos Teste' }] } },
    include: { subcategories: true },
  });

  const now = new Date();
  const ticket = await prisma.ticket.create({
    data: {
      title: 'Erro ao processar pagamento',
      description: 'O sistema retorna erro ao tentar processar o pagamento.',
      categoryId: category.id,
      subcategoryId: category.subcategories[0].id,
      urgency: 'ALTO',
      requesterId: requester.id,
      sectorId: sector.id,
      slaFirstResponseDeadline: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      slaResolutionDeadline: new Date(now.getTime() + 8 * 60 * 60 * 1000),
    },
  });

  expect(ticket.status).toBe('ABERTO');
  expect(ticket.assignedToId).toBeNull();
});
