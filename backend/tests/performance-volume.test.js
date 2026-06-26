const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

let token;
let noPermToken;
const ids = { sectors: [], roles: [], users: [], tickets: [], categories: [] };

beforeAll(async () => {
  const sector = await prisma.sector.create({ data: { name: 'Sector Vol Test' } });
  ids.sectors.push(sector.id);

  const role = await prisma.role.create({
    data: {
      name: 'Role Vol Test',
      level: 2,
      permissions: { create: [{ permissionKey: 'view_performance_panel', enabled: true }] },
    },
  });
  ids.roles = [role.id];

  const user = await prisma.user.create({
    data: {
      name: 'Vol User',
      email: 'vol.test@example.com',
      passwordHash: 'h',
      roleId: role.id,
      sectorId: sector.id,
    },
  });
  ids.users.push(user.id);
  token = signAccessToken(user.id);

  const noPermRole = await prisma.role.create({ data: { name: 'NoPerm Vol Role', level: 1 } });
  ids.roles.push(noPermRole.id);
  const noPermUser = await prisma.user.create({
    data: {
      name: 'NoPerm Vol User',
      email: 'noperm.vol.test@example.com',
      passwordHash: 'h',
      roleId: noPermRole.id,
      sectorId: sector.id,
    },
  });
  ids.users.push(noPermUser.id);
  noPermToken = signAccessToken(noPermUser.id);

  const category = await prisma.category.create({
    data: {
      name: 'Cat Vol Test',
      subcategories: { create: [{ name: 'Sub Vol Test' }] },
    },
    include: { subcategories: true },
  });
  ids.categories.push(category.id);
  const subcategory = category.subcategories[0];
  const now = new Date('2026-06-15T10:00:00Z');
  const t = await prisma.ticket.create({
    data: {
      title: 'Vol Ticket',
      description: 'desc',
      urgency: 'MEDIO',
      requesterId: user.id,
      sectorId: sector.id,
      categoryId: category.id,
      subcategoryId: subcategory.id,
      slaFirstResponseDeadline: new Date(now.getTime() + 8 * 3600000),
      slaResolutionDeadline: new Date(now.getTime() + 72 * 3600000),
      createdAt: now,
    },
  });
  ids.tickets.push(t.id);
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { id: { in: ids.tickets } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  for (const roleId of ids.roles) {
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    await prisma.role.delete({ where: { id: roleId } });
  }
  await prisma.subcategory.deleteMany({ where: { categoryId: { in: ids.categories } } });
  await prisma.category.deleteMany({ where: { id: { in: ids.categories } } });
  await prisma.sector.deleteMany({ where: { id: { in: ids.sectors } } });
});

test('GET /api/performance/volume retorna array com date, created, resolved', async () => {
  const res = await request(app)
    .get('/api/performance/volume?from=2026-06-01&to=2026-06-30')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  const entry = res.body.find(r => r.date === '2026-06-15');
  expect(entry).toBeDefined();
  expect(entry.created).toBeGreaterThanOrEqual(1);
  expect(typeof entry.resolved).toBe('number');
});

test('GET /api/performance/volume requer from e to', async () => {
  const res = await request(app)
    .get('/api/performance/volume')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(400);
});

test('GET /api/performance/volume requer view_performance_panel', async () => {
  const res = await request(app)
    .get('/api/performance/volume?from=2026-06-01&to=2026-06-30')
    .set('Authorization', `Bearer ${noPermToken}`);
  expect(res.status).toBe(403);
});
