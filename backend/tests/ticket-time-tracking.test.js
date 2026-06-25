const prisma = require('../src/lib/prisma');

let sector;
let role;
let user;
let ticket;

beforeAll(async () => {
  sector = await prisma.sector.create({ data: { name: 'Sector Teste TimeLog' } });
  role = await prisma.role.create({ data: { name: 'Role Teste TimeLog', level: 1 } });
  user = await prisma.user.create({
    data: {
      name: 'Usuário Teste TimeLog',
      email: 'timelog@example.com',
      passwordHash: 'hash',
      roleId: role.id,
      sectorId: sector.id,
    },
  });

  const category = await prisma.category.create({
    data: { name: 'Categoria Teste TimeLog', subcategories: { create: [{ name: 'Sub Teste TimeLog' }] } },
    include: { subcategories: true },
  });

  const now = new Date();
  ticket = await prisma.ticket.create({
    data: {
      title: 'Chamado teste timelog',
      description: 'Descrição de teste',
      categoryId: category.id,
      subcategoryId: category.subcategories[0].id,
      urgency: 'MEDIO',
      requesterId: user.id,
      sectorId: sector.id,
      slaFirstResponseDeadline: new Date(now.getTime() + 4 * 60 * 60 * 1000),
      slaResolutionDeadline: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    },
  });
});

afterAll(async () => {
  await prisma.ticketAttachment.deleteMany();
  await prisma.ticketComment.deleteMany();
  await prisma.ticketTimeLog.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.subcategory.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.sector.deleteMany();
  await prisma.$disconnect();
});

test('creates a CREATED time log entry for a ticket', async () => {
  const log = await prisma.ticketTimeLog.create({
    data: {
      ticketId: ticket.id,
      eventType: 'CREATED',
      toStatus: 'ABERTO',
      authorId: user.id,
    },
  });

  expect(log.eventType).toBe('CREATED');
});

test('creates a public comment and an internal note, defaulting to public', async () => {
  const publicComment = await prisma.ticketComment.create({
    data: { ticketId: ticket.id, authorId: user.id, body: 'Comentário público' },
  });
  const internalNote = await prisma.ticketComment.create({
    data: { ticketId: ticket.id, authorId: user.id, body: 'Nota interna', isInternal: true },
  });

  expect(publicComment.isInternal).toBe(false);
  expect(internalNote.isInternal).toBe(true);
});

test('creates an attachment linked to a comment and one linked directly to a ticket', async () => {
  const comment = await prisma.ticketComment.create({
    data: { ticketId: ticket.id, authorId: user.id, body: 'Comentário com anexo' },
  });

  const attachmentOnComment = await prisma.ticketAttachment.create({
    data: {
      ticketId: ticket.id,
      commentId: comment.id,
      fileName: 'print.png',
      filePath: '/uploads/print.png',
      uploadedById: user.id,
    },
  });

  const attachmentOnTicket = await prisma.ticketAttachment.create({
    data: {
      ticketId: ticket.id,
      fileName: 'documento.pdf',
      filePath: '/uploads/documento.pdf',
      uploadedById: user.id,
    },
  });

  expect(attachmentOnComment.commentId).toBe(comment.id);
  expect(attachmentOnTicket.commentId).toBeNull();
});
