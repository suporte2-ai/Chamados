const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const ids = { sectors: [], roles: [], users: [], categories: [], tickets: [], ideas: [], notifications: [] };

let gestorToken, techToken, requesterToken;
let gestorId, techId, requesterId;
let ticketId, ideaId, idea2Id;
let notifReadId;

beforeAll(async () => {
  const sector = await prisma.sector.create({ data: { name: 'Setor Notif Test' } });
  ids.sectors.push(sector.id);

  const gestorRole = await prisma.role.create({
    data: {
      name: 'Gestor Notif Test',
      level: 3,
      permissions: {
        create: [
          { permissionKey: 'reassign_tickets', enabled: true },
          { permissionKey: 'close_tickets', enabled: true },
          { permissionKey: 'manage_ideas', enabled: true },
          { permissionKey: 'reopen_tickets', enabled: true },
          { permissionKey: 'view_sector_tickets', enabled: true },
        ],
      },
    },
  });
  ids.roles.push(gestorRole.id);

  const techRole = await prisma.role.create({
    data: { name: 'Tech Notif Test', level: 1 },
  });
  ids.roles.push(techRole.id);

  const gestor = await prisma.user.create({
    data: { name: 'Gestor Notif', email: 'gestor.notif@example.com', passwordHash: 'hash', roleId: gestorRole.id, sectorId: sector.id },
  });
  ids.users.push(gestor.id);
  gestorId = gestor.id;
  gestorToken = signAccessToken(gestor.id);

  const tech = await prisma.user.create({
    data: { name: 'Tech Notif', email: 'tech.notif@example.com', passwordHash: 'hash', roleId: techRole.id, sectorId: sector.id },
  });
  ids.users.push(tech.id);
  techId = tech.id;
  techToken = signAccessToken(tech.id);

  const requester = await prisma.user.create({
    data: { name: 'Requester Notif', email: 'requester.notif@example.com', passwordHash: 'hash', roleId: techRole.id, sectorId: sector.id },
  });
  ids.users.push(requester.id);
  requesterId = requester.id;
  requesterToken = signAccessToken(requester.id);

  const category = await prisma.category.create({
    data: {
      name: 'Cat Notif Test',
      subcategories: { create: [{ name: 'Sub Notif Test' }] },
    },
    include: { subcategories: true },
  });
  ids.categories.push(category.id);

  const ticket = await prisma.ticket.create({
    data: {
      title: 'Ticket Notif Test',
      description: 'desc',
      categoryId: category.id,
      subcategoryId: category.subcategories[0].id,
      urgency: 'MEDIO',
      requesterId: requesterId,
      sectorId: sector.id,
      assignedToId: techId,
      slaFirstResponseDeadline: new Date(Date.now() + 4 * 60 * 60 * 1000),
      slaResolutionDeadline: new Date(Date.now() + 8 * 60 * 60 * 1000),
    },
  });
  ids.tickets.push(ticket.id);
  ticketId = ticket.id;

  // idea for status-change trigger test
  const idea = await prisma.idea.create({
    data: { title: 'Ideia Notif Test', description: 'desc', areaImpacted: 'TI', expectedBenefit: 'Produtividade', authorId: techId, status: 'EM_ANALISE' },
  });
  ids.ideas.push(idea.id);
  ideaId = idea.id;

  // idea2 for vote trigger test (stays EM_ANALISE throughout)
  const idea2 = await prisma.idea.create({
    data: { title: 'Ideia Vote Test', description: 'desc', areaImpacted: 'RH', expectedBenefit: 'Engajamento', authorId: techId, status: 'EM_ANALISE' },
  });
  ids.ideas.push(idea2.id);
  idea2Id = idea2.id;

  // Direct notifications for endpoint tests
  const nUnread = await prisma.notification.create({
    data: { userId: techId, type: 'TICKET_ASSIGNED', message: 'Notif unread', link: '/tickets/1', isRead: false },
  });
  const nRead = await prisma.notification.create({
    data: { userId: techId, type: 'TICKET_COMMENT', message: 'Notif read', link: '/tickets/1', isRead: true },
  });
  const nGestor = await prisma.notification.create({
    data: { userId: gestorId, type: 'IDEA_VOTE', message: 'Notif gestor', link: '/ideas/1', isRead: false },
  });
  ids.notifications.push(nUnread.id, nRead.id, nGestor.id);
  notifReadId = nRead.id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids.users } } });
  await prisma.ideaVote.deleteMany({ where: { ideaId: { in: ids.ideas } } });
  await prisma.idea.deleteMany({ where: { id: { in: ids.ideas } } });
  await prisma.ticketComment.deleteMany({ where: { ticketId: { in: ids.tickets } } });
  await prisma.ticketTimeLog.deleteMany({ where: { ticketId: { in: ids.tickets } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ids.tickets } } });
  await prisma.subcategory.deleteMany({ where: { categoryId: { in: ids.categories } } });
  await prisma.category.deleteMany({ where: { id: { in: ids.categories } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.role.deleteMany({ where: { id: { in: ids.roles } } });
  await prisma.sector.deleteMany({ where: { id: { in: ids.sectors } } });
  await prisma.$disconnect();
});

// --- endpoint tests ---

test('GET /notifications retorna notificações do usuário em ordem createdAt desc', async () => {
  const res = await request(app)
    .get('/api/notifications')
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body.length).toBeGreaterThanOrEqual(2);
  const dates = res.body.map((n) => new Date(n.createdAt).getTime());
  for (let i = 1; i < dates.length; i++) {
    expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
  }
});

test('GET /notifications?unreadOnly=true retorna apenas não lidas', async () => {
  const res = await request(app)
    .get('/api/notifications?unreadOnly=true')
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(200);
  expect(res.body.length).toBeGreaterThanOrEqual(1);
  expect(res.body.every((n) => n.isRead === false)).toBe(true);
});

test('GET /notifications não retorna notificações de outros usuários', async () => {
  const res = await request(app)
    .get('/api/notifications')
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(200);
  expect(res.body.every((n) => n.userId === techId)).toBe(true);
});

test('PATCH /notifications/read-all marca todas como lidas e retorna count', async () => {
  const extra = await prisma.notification.create({
    data: { userId: techId, type: 'TICKET_ASSIGNED', message: 'Extra unread', link: '/tickets/1', isRead: false },
  });
  ids.notifications.push(extra.id);

  const res = await request(app)
    .patch('/api/notifications/read-all')
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(200);
  expect(res.body.updated).toBeGreaterThanOrEqual(1);

  const remaining = await prisma.notification.findMany({ where: { userId: techId, isRead: false } });
  expect(remaining).toHaveLength(0);
});

test('PATCH /notifications/:id/read marca uma notificação como lida', async () => {
  const n = await prisma.notification.create({
    data: { userId: techId, type: 'TICKET_STATUS_CHANGED', message: 'Mark one', link: '/tickets/1', isRead: false },
  });
  ids.notifications.push(n.id);

  const res = await request(app)
    .patch(`/api/notifications/${n.id}/read`)
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(200);
  expect(res.body.isRead).toBe(true);
});

test('PATCH /notifications/:id/read é idempotente (já lida → 200)', async () => {
  const res = await request(app)
    .patch(`/api/notifications/${notifReadId}/read`)
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(200);
  expect(res.body.isRead).toBe(true);
});

test('PATCH /notifications/:id/read retorna 404 para notificação inexistente', async () => {
  const res = await request(app)
    .patch('/api/notifications/999999/read')
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(404);
});

test('PATCH /notifications/:id/read retorna 403 para notificação de outro usuário', async () => {
  // ids.notifications[2] belongs to gestorId; techToken should get 403
  const gestorNotifId = ids.notifications[2];
  const res = await request(app)
    .patch(`/api/notifications/${gestorNotifId}/read`)
    .set('Authorization', `Bearer ${techToken}`);

  expect(res.status).toBe(403);
});

// --- trigger tests (sequential, share ticket/idea state) ---

test('PATCH /tickets/:id com novo assignedToId cria TICKET_ASSIGNED para o assignee', async () => {
  // Reassign from techId to gestorId using gestor (has reassign_tickets)
  const res = await request(app)
    .patch(`/api/tickets/${ticketId}`)
    .set('Authorization', `Bearer ${gestorToken}`)
    .send({ assignedToId: gestorId });

  expect(res.status).toBe(200);

  const notif = await prisma.notification.findFirst({
    where: { userId: gestorId, type: 'TICKET_ASSIGNED', link: `/tickets/${ticketId}` },
  });
  expect(notif).not.toBeNull();
  expect(notif.message).toContain(`#${ticketId}`);
});

test('PATCH /tickets/:id muda status cria TICKET_STATUS_CHANGED para solicitante', async () => {
  // Ticket is now assigned to gestorId; gestor changes status ABERTO → EM_ANDAMENTO
  const res = await request(app)
    .patch(`/api/tickets/${ticketId}`)
    .set('Authorization', `Bearer ${gestorToken}`)
    .send({ status: 'EM_ANDAMENTO' });

  expect(res.status).toBe(200);

  const notif = await prisma.notification.findFirst({
    where: { userId: requesterId, type: 'TICKET_STATUS_CHANGED', link: `/tickets/${ticketId}` },
  });
  expect(notif).not.toBeNull();
});

test('POST /tickets/:id/comments cria TICKET_COMMENT para assignee', async () => {
  // Ticket is EM_ANDAMENTO assigned to gestorId; requester comments → gestorId notified
  const res = await request(app)
    .post(`/api/tickets/${ticketId}/comments`)
    .set('Authorization', `Bearer ${requesterToken}`)
    .send({ body: 'Comentário trigger test', isInternal: false });

  expect(res.status).toBe(201);

  const notif = await prisma.notification.findFirst({
    where: { userId: gestorId, type: 'TICKET_COMMENT', link: `/tickets/${ticketId}` },
  });
  expect(notif).not.toBeNull();
});

test('PATCH /ideas/:id/status cria IDEA_STATUS_CHANGED para autor da ideia', async () => {
  const res = await request(app)
    .patch(`/api/ideas/${ideaId}/status`)
    .set('Authorization', `Bearer ${gestorToken}`)
    .send({ status: 'APROVADA' });

  expect(res.status).toBe(200);

  const notif = await prisma.notification.findFirst({
    where: { userId: techId, type: 'IDEA_STATUS_CHANGED', link: `/ideas/${ideaId}` },
  });
  expect(notif).not.toBeNull();
  expect(notif.message).toContain('APROVADA');
});

test('POST /ideas/:id/vote cria IDEA_VOTE para autor quando votante é diferente do autor', async () => {
  // requester votes on idea2 (authored by techId) → techId gets IDEA_VOTE
  const res = await request(app)
    .post(`/api/ideas/${idea2Id}/vote`)
    .set('Authorization', `Bearer ${requesterToken}`);

  expect(res.status).toBe(200);
  expect(res.body.voted).toBe(true);

  const notif = await prisma.notification.findFirst({
    where: { userId: techId, type: 'IDEA_VOTE', link: `/ideas/${idea2Id}` },
  });
  expect(notif).not.toBeNull();
});
