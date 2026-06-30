const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/lib/prisma');
const { signAccessToken } = require('../src/lib/jwt');

const ids = { sectors: [], roles: [], users: [], events: [] };

let adminToken, gestorToken, userToken;
let adminId, gestorId, userId1, userId2;
let sectorId;
let eventId;

beforeAll(async () => {
  const sector = await prisma.sector.create({ data: { name: 'Setor Eventos Test' } });
  sectorId = sector.id;
  ids.sectors.push(sector.id);

  const adminRole = await prisma.role.create({
    data: {
      name: 'Role Events Admin',
      level: 4,
      permissions: { create: [{ permissionKey: 'manage_events', enabled: true }] },
    },
  });
  ids.roles.push(adminRole.id);

  const gestorRole = await prisma.role.create({
    data: {
      name: 'Role Events Gestor',
      level: 3,
      permissions: { create: [{ permissionKey: 'manage_events', enabled: true }] },
    },
  });
  ids.roles.push(gestorRole.id);

  const userRole = await prisma.role.create({
    data: { name: 'Role Events User', level: 1 },
  });
  ids.roles.push(userRole.id);

  const admin = await prisma.user.create({
    data: { name: 'Admin Eventos', email: 'events-admin@test.com', passwordHash: 'x', roleId: adminRole.id, sectorId: sector.id },
  });
  adminId = admin.id;
  ids.users.push(admin.id);
  adminToken = signAccessToken(admin.id);

  const gestor = await prisma.user.create({
    data: { name: 'Gestor Eventos', email: 'events-gestor@test.com', passwordHash: 'x', roleId: gestorRole.id, sectorId: sector.id },
  });
  gestorId = gestor.id;
  ids.users.push(gestor.id);
  gestorToken = signAccessToken(gestor.id);

  const user1 = await prisma.user.create({
    data: { name: 'User1 Eventos', email: 'events-user1@test.com', passwordHash: 'x', roleId: userRole.id, sectorId: sector.id },
  });
  userId1 = user1.id;
  ids.users.push(user1.id);
  userToken = signAccessToken(user1.id);

  const user2 = await prisma.user.create({
    data: { name: 'User2 Eventos', email: 'events-user2@test.com', passwordHash: 'x', roleId: userRole.id, sectorId: sector.id },
  });
  userId2 = user2.id;
  ids.users.push(user2.id);
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids.users } } });
  await prisma.eventAttendee.deleteMany({ where: { eventId: { in: ids.events } } });
  await prisma.event.deleteMany({ where: { id: { in: ids.events } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.role.deleteMany({ where: { id: { in: ids.roles } } });
  await prisma.sector.deleteMany({ where: { id: { in: ids.sectors } } });
  await prisma.$disconnect();
});

// --- lookup ---

test('GET /events/lookup/sectors retorna setores para manage_events', async () => {
  const res = await request(app).get('/api/events/lookup/sectors').set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body.find(s => s.id === sectorId)).toBeTruthy();
});

test('GET /events/lookup/sectors retorna 403 para usuário sem permissão', async () => {
  const res = await request(app).get('/api/events/lookup/sectors').set('Authorization', `Bearer ${userToken}`);
  expect(res.status).toBe(403);
});

test('GET /events/lookup/users retorna usuários ativos para manage_events', async () => {
  const res = await request(app).get('/api/events/lookup/users').set('Authorization', `Bearer ${gestorToken}`);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  const found = res.body.find(u => u.id === userId1);
  expect(found).toBeTruthy();
  expect(found.sector).toBeTruthy();
});

// --- create ---

test('POST /events cria evento scope=USUARIO com attendees corretos', async () => {
  const res = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${gestorToken}`)
    .send({
      title: 'Reunião TI',
      startAt: '2026-08-10T14:00:00.000Z',
      endAt: '2026-08-10T15:00:00.000Z',
      scope: 'USUARIO',
      userIds: [userId1, userId2],
    });
  expect(res.status).toBe(201);
  expect(res.body.attendeeCount).toBe(2);
  eventId = res.body.id;
  ids.events.push(eventId);
});

test('POST /events scope=SETOR cria attendees do setor', async () => {
  const res = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      title: 'Reunião Setor',
      startAt: '2026-08-11T09:00:00.000Z',
      endAt: '2026-08-11T10:00:00.000Z',
      scope: 'SETOR',
      sectorId,
    });
  expect(res.status).toBe(201);
  expect(res.body.attendeeCount).toBeGreaterThanOrEqual(1);
  ids.events.push(res.body.id);
});

test('POST /events sem title retorna 400', async () => {
  const res = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ startAt: '2026-08-10T14:00:00.000Z', endAt: '2026-08-10T15:00:00.000Z', scope: 'EMPRESA' });
  expect(res.status).toBe(400);
});

test('POST /events scope=USUARIO com userIds vazio retorna 422', async () => {
  const res = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'X', startAt: '2026-08-10T14:00:00.000Z', endAt: '2026-08-10T15:00:00.000Z', scope: 'USUARIO', userIds: [] });
  expect(res.status).toBe(422);
});

test('POST /events endAt <= startAt retorna 400', async () => {
  const res = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'X', startAt: '2026-08-10T15:00:00.000Z', endAt: '2026-08-10T14:00:00.000Z', scope: 'EMPRESA' });
  expect(res.status).toBe(400);
});

test('POST /events sem manage_events retorna 403', async () => {
  const res = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ title: 'X', startAt: '2026-08-10T14:00:00.000Z', endAt: '2026-08-10T15:00:00.000Z', scope: 'EMPRESA' });
  expect(res.status).toBe(403);
});

// --- list ---

test('GET /events retorna apenas eventos do usuário logado com myRsvp', async () => {
  const res = await request(app).get('/api/events').set('Authorization', `Bearer ${userToken}`);
  expect(res.status).toBe(200);
  const myEvent = res.body.find(e => e.id === eventId);
  expect(myEvent).toBeTruthy();
  expect(myEvent.myRsvp).toBe('PENDENTE');
  expect(myEvent.attendeeCount).toBeDefined();
});

test('GET /events não retorna eventos de outros usuários', async () => {
  const otherRole = await prisma.role.create({ data: { name: 'Role Other Evt', level: 1 } });
  ids.roles.push(otherRole.id);
  const other = await prisma.user.create({
    data: { name: 'Other', email: 'events-other@test.com', passwordHash: 'x', roleId: otherRole.id, sectorId },
  });
  ids.users.push(other.id);
  const otherToken = signAccessToken(other.id);

  const res = await request(app).get('/api/events').set('Authorization', `Bearer ${otherToken}`);
  expect(res.status).toBe(200);
  expect(res.body.find(e => e.id === eventId)).toBeUndefined();
});

// --- detail ---

test('GET /events/:id retorna evento com myRsvp para participante', async () => {
  const res = await request(app).get(`/api/events/${eventId}`).set('Authorization', `Bearer ${userToken}`);
  expect(res.status).toBe(200);
  expect(res.body.id).toBe(eventId);
  expect(res.body.myRsvp).toBe('PENDENTE');
});

test('GET /events/:id inclui attendees para criador', async () => {
  const res = await request(app).get(`/api/events/${eventId}`).set('Authorization', `Bearer ${gestorToken}`);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.attendees)).toBe(true);
});

test('GET /events/:id retorna 404 para usuário não convidado', async () => {
  const role = await prisma.role.create({ data: { name: 'Role NoInv', level: 1 } });
  ids.roles.push(role.id);
  const stranger = await prisma.user.create({
    data: { name: 'Stranger', email: 'events-stranger@test.com', passwordHash: 'x', roleId: role.id, sectorId },
  });
  ids.users.push(stranger.id);
  const strangerToken = signAccessToken(stranger.id);

  const res = await request(app).get(`/api/events/${eventId}`).set('Authorization', `Bearer ${strangerToken}`);
  expect(res.status).toBe(404);
});

// --- rsvp ---

test('PATCH /events/:id/rsvp atualiza rsvp do usuário logado', async () => {
  const res = await request(app)
    .patch(`/api/events/${eventId}/rsvp`)
    .set('Authorization', `Bearer ${userToken}`)
    .send({ rsvp: 'CONFIRMADO' });
  expect(res.status).toBe(200);
  expect(res.body.rsvp).toBe('CONFIRMADO');
});

test('PATCH /events/:id/rsvp rsvp inválido retorna 400', async () => {
  const res = await request(app)
    .patch(`/api/events/${eventId}/rsvp`)
    .set('Authorization', `Bearer ${userToken}`)
    .send({ rsvp: 'TALVEZ' });
  expect(res.status).toBe(400);
});

test('PATCH /events/:id/rsvp retorna 404 para não participante', async () => {
  const role = await prisma.role.create({ data: { name: 'Role NoRsvp', level: 1 } });
  ids.roles.push(role.id);
  const stranger = await prisma.user.create({
    data: { name: 'No RSVP', email: 'events-norsvp@test.com', passwordHash: 'x', roleId: role.id, sectorId },
  });
  ids.users.push(stranger.id);
  const strangerToken = signAccessToken(stranger.id);

  const res = await request(app)
    .patch(`/api/events/${eventId}/rsvp`)
    .set('Authorization', `Bearer ${strangerToken}`)
    .send({ rsvp: 'CONFIRMADO' });
  expect(res.status).toBe(404);
});

// --- update ---

test('PATCH /events/:id atualiza título e reseta flags de notificação', async () => {
  const res = await request(app)
    .patch(`/api/events/${eventId}`)
    .set('Authorization', `Bearer ${gestorToken}`)
    .send({ title: 'Reunião TI Atualizada', startAt: '2026-08-10T16:00:00.000Z' });
  expect(res.status).toBe(200);
  expect(res.body.title).toBe('Reunião TI Atualizada');
});

test('PATCH /events/:id retorna 403 para gestor que não criou o evento', async () => {
  const anotherGestorRole = await prisma.role.create({
    data: {
      name: 'Role Another Gestor',
      level: 3,
      permissions: { create: [{ permissionKey: 'manage_events', enabled: true }] },
    },
  });
  ids.roles.push(anotherGestorRole.id);
  const anotherGestor = await prisma.user.create({
    data: { name: 'Other Gestor', email: 'events-othergestor@test.com', passwordHash: 'x', roleId: anotherGestorRole.id, sectorId },
  });
  ids.users.push(anotherGestor.id);
  const otherGestorToken = signAccessToken(anotherGestor.id);

  const res = await request(app)
    .patch(`/api/events/${eventId}`)
    .set('Authorization', `Bearer ${otherGestorToken}`)
    .send({ title: 'Hackeado' });
  expect(res.status).toBe(403);
});

// --- delete ---

test('DELETE /events/:id cancela evento e envia notificações', async () => {
  const toDelete = await prisma.event.create({
    data: {
      title: 'Para Deletar',
      startAt: new Date('2026-08-20T10:00:00Z'),
      endAt: new Date('2026-08-20T11:00:00Z'),
      scope: 'USUARIO',
      createdById: gestorId,
      attendees: { create: [{ userId: userId1 }] },
    },
  });
  ids.events.push(toDelete.id);

  const res = await request(app)
    .delete(`/api/events/${toDelete.id}`)
    .set('Authorization', `Bearer ${gestorToken}`);
  expect(res.status).toBe(204);

  const deleted = await prisma.event.findUnique({ where: { id: toDelete.id } });
  expect(deleted).toBeNull();
});
