const prisma = require('../src/lib/prisma');

let sector;
let role;
let user;

beforeAll(async () => {
  sector = await prisma.sector.create({ data: { name: 'Sector Teste Notif' } });
  role = await prisma.role.create({ data: { name: 'Role Teste Notif', level: 1 } });
  user = await prisma.user.create({
    data: {
      name: 'Usuário Teste Notif',
      email: 'notif@example.com',
      passwordHash: 'hash',
      roleId: role.id,
      sectorId: sector.id,
    },
  });
});

afterAll(async () => {
  await prisma.notification.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.sector.deleteMany();
  await prisma.$disconnect();
});

test('creates a notification defaulting to unread', async () => {
  const notification = await prisma.notification.create({
    data: {
      userId: user.id,
      type: 'TICKET_ASSIGNED',
      message: 'Você recebeu um novo chamado.',
      link: '/tickets/1',
    },
  });

  expect(notification.isRead).toBe(false);
});

test('marks a notification as read', async () => {
  const notification = await prisma.notification.create({
    data: { userId: user.id, type: 'TICKET_UPDATED', message: 'Chamado atualizado.' },
  });

  const updated = await prisma.notification.update({
    where: { id: notification.id },
    data: { isRead: true },
  });

  expect(updated.isRead).toBe(true);
});
