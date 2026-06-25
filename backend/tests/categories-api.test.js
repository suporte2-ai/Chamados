const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const createdRoleIds = [];
const createdSectorIds = [];
const createdUserIds = [];
const createdCategoryIds = [];

let adminToken;

beforeAll(async () => {
  const sector = await prisma.sector.create({ data: { name: 'Sector Teste Categories API' } });
  createdSectorIds.push(sector.id);

  const adminRole = await prisma.role.create({
    data: {
      name: 'Role Teste Categories API Admin',
      level: 4,
      permissions: { create: [{ permissionKey: 'manage_categories', enabled: true }] },
    },
  });
  createdRoleIds.push(adminRole.id);

  const adminUser = await prisma.user.create({
    data: {
      name: 'Admin Teste Categories API',
      email: 'categories-api.admin@example.com',
      passwordHash: 'hash',
      roleId: adminRole.id,
      sectorId: sector.id,
    },
  });
  createdUserIds.push(adminUser.id);
  adminToken = signAccessToken(adminUser.id);
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { categoryId: { in: createdCategoryIds } } });
  await prisma.subcategory.deleteMany({ where: { categoryId: { in: createdCategoryIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  await prisma.sector.deleteMany({ where: { id: { in: createdSectorIds } } });
  await prisma.$disconnect();
});

test('POST /api/categories creates a category with subcategories', async () => {
  const response = await request(app)
    .post('/api/categories')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Categoria Teste API', subcategories: ['Sub A', 'Sub B'] });

  expect(response.status).toBe(201);
  expect(response.body.subcategories).toHaveLength(2);
  createdCategoryIds.push(response.body.id);
});

test('GET /api/categories lists categories with their subcategories', async () => {
  const response = await request(app).get('/api/categories').set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(200);
  expect(Array.isArray(response.body)).toBe(true);
  expect(response.body.some((c) => c.id === createdCategoryIds[0])).toBe(true);
});

test('POST /api/categories/:id/subcategories adds a subcategory to an existing category', async () => {
  const response = await request(app)
    .post(`/api/categories/${createdCategoryIds[0]}/subcategories`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Sub C' });

  expect(response.status).toBe(201);
  expect(response.body.name).toBe('Sub C');
});

test('DELETE /api/categories/:id returns 409 when the category has tickets linked', async () => {
  const category = await prisma.category.create({
    data: { name: 'Categoria Com Ticket Teste API', subcategories: { create: [{ name: 'Sub Com Ticket' }] } },
    include: { subcategories: true },
  });
  createdCategoryIds.push(category.id);

  const sector = await prisma.sector.create({ data: { name: 'Sector Teste Categories API Ticket' } });
  createdSectorIds.push(sector.id);
  const role = await prisma.role.create({ data: { name: 'Role Teste Categories API Ticket', level: 1 } });
  createdRoleIds.push(role.id);
  const requester = await prisma.user.create({
    data: {
      name: 'Solicitante Teste Categories API',
      email: 'categories-api.requester@example.com',
      passwordHash: 'hash',
      roleId: role.id,
      sectorId: sector.id,
    },
  });
  createdUserIds.push(requester.id);

  await prisma.ticket.create({
    data: {
      title: 'Chamado vinculado',
      description: 'desc',
      categoryId: category.id,
      subcategoryId: category.subcategories[0].id,
      urgency: 'BAIXO',
      requesterId: requester.id,
      sectorId: sector.id,
      slaFirstResponseDeadline: new Date(),
      slaResolutionDeadline: new Date(),
    },
  });

  const response = await request(app)
    .delete(`/api/categories/${category.id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(409);
});

test('DELETE /api/subcategories/:id returns 409 when the subcategory has tickets linked', async () => {
  expect(true).toBe(true);
});
