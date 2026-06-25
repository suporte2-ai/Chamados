const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { PERMISSION_KEYS, FIELD_KEYS } = require('../src/lib/permissions');

const prisma = new PrismaClient();

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const URGENCY_SLA_HOURS = {
  CRITICO: { firstResponseHours: 1, resolutionHours: 4 },
  ALTO: { firstResponseHours: 2, resolutionHours: 8 },
  MEDIO: { firstResponseHours: 4, resolutionHours: 24 },
  BAIXO: { firstResponseHours: 8, resolutionHours: 72 },
};

const TICKET_TITLES = [
  'Computador não liga',
  'Erro ao acessar sistema financeiro',
  'Solicitação de novo crachá',
  'Internet instável no setor',
  'Pedido de reembolso de viagem',
  'Impressora sem tonner',
  'Acesso negado à pasta compartilhada',
  'Dúvida sobre benefício de saúde',
  'Lentidão no sistema de RH',
  'Manutenção do ar-condicionado',
];

const IDEA_DEFINITIONS = [
  { title: 'Padronizar respostas automáticas de chamados', areaImpacted: 'TI', expectedBenefit: 'Reduz tempo de primeira resposta', status: 'IMPLEMENTADA' },
  { title: 'Checklist de onboarding para novos colaboradores', areaImpacted: 'RH', expectedBenefit: 'Reduz erros no processo de admissão', status: 'EM_IMPLEMENTACAO' },
  { title: 'Aprovação digital de reembolsos', areaImpacted: 'Financeiro', expectedBenefit: 'Agiliza reembolsos em até 2 dias', status: 'APROVADA' },
  { title: 'Manutenção preventiva trimestral de ar-condicionado', areaImpacted: 'Infraestrutura', expectedBenefit: 'Reduz chamados de manutenção corretiva', status: 'EM_ANALISE' },
  { title: 'Base de conhecimento self-service', areaImpacted: 'TI', expectedBenefit: 'Reduz volume de chamados repetitivos', status: 'NOVA' },
  { title: 'Pesquisa de satisfação pós-fechamento', areaImpacted: 'TI', expectedBenefit: 'Mede qualidade do atendimento', status: 'NOVA' },
  { title: 'Revisão do plano de benefícios', areaImpacted: 'RH', expectedBenefit: 'Aumenta satisfação dos colaboradores', status: 'ARQUIVADA' },
  { title: 'Dashboard de gastos por setor', areaImpacted: 'Financeiro', expectedBenefit: 'Melhora visibilidade orçamentária', status: 'EM_ANALISE' },
  { title: 'App de abertura de chamados via celular', areaImpacted: 'TI', expectedBenefit: 'Facilita abertura de chamados em campo', status: 'APROVADA' },
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(array) {
  return array[randomInt(0, array.length - 1)];
}

async function clearDatabase() {
  await prisma.notification.deleteMany();
  await prisma.ideaComment.deleteMany();
  await prisma.ideaVote.deleteMany();
  await prisma.idea.deleteMany();
  await prisma.ticketAttachment.deleteMany();
  await prisma.ticketComment.deleteMany();
  await prisma.ticketTimeLog.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.subcategory.deleteMany();
  await prisma.category.deleteMany();
  await prisma.slaConfig.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.sector.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.roleFieldVisibility.deleteMany();
  await prisma.role.deleteMany();
}

async function seedRolesAndPermissions() {
  const admin = await prisma.role.create({ data: { name: 'Administrador', level: 4, isSystemDefault: true } });
  const gestor = await prisma.role.create({ data: { name: 'Gestor', level: 3, isSystemDefault: true } });
  const tecnico = await prisma.role.create({ data: { name: 'Técnico/Atendente', level: 2, isSystemDefault: true } });
  const usuarioFinal = await prisma.role.create({ data: { name: 'Usuário Final', level: 1, isSystemDefault: true } });

  const allPermissionKeys = PERMISSION_KEYS;

  const rolePermissionMatrix = {
    [admin.id]: allPermissionKeys,
    [gestor.id]: [
      'view_performance_panel',
      'view_financial_reports',
      'reassign_tickets',
      'close_tickets',
      'view_internal_notes',
      'reopen_tickets',
      'view_all_tickets',
      'update_cost',
      'manage_ideas',
    ],
    [tecnico.id]: ['view_internal_notes', 'reopen_tickets', 'view_own_metrics', 'view_sector_tickets'],
    [usuarioFinal.id]: [],
  };

  for (const [roleId, enabledKeys] of Object.entries(rolePermissionMatrix)) {
    for (const key of allPermissionKeys) {
      await prisma.rolePermission.create({
        data: { roleId: Number(roleId), permissionKey: key, enabled: enabledKeys.includes(key) },
      });
    }
  }

  const allFieldKeys = FIELD_KEYS;

  const fieldVisibilityMatrix = {
    [admin.id]: allFieldKeys,
    [gestor.id]: allFieldKeys,
    [tecnico.id]: ['assigned_to', 'sla_badge'],
    [usuarioFinal.id]: [],
  };

  for (const [roleId, visibleKeys] of Object.entries(fieldVisibilityMatrix)) {
    for (const key of allFieldKeys) {
      await prisma.roleFieldVisibility.create({
        data: { roleId: Number(roleId), fieldKey: key, visible: visibleKeys.includes(key) },
      });
    }
  }

  return { admin, gestor, tecnico, usuarioFinal };
}

async function seedSectors() {
  const names = ['TI', 'RH', 'Financeiro'];
  const sectors = [];
  for (const name of names) {
    sectors.push(await prisma.sector.create({ data: { name } }));
  }
  return sectors;
}

async function seedCategories() {
  const definitions = [
    { name: 'TI', subcategories: ['Hardware', 'Software', 'Rede'] },
    { name: 'RH', subcategories: ['Admissão', 'Benefícios'] },
    { name: 'Financeiro', subcategories: ['Pagamentos', 'Reembolsos'] },
    { name: 'Infraestrutura', subcategories: ['Manutenção', 'Predial'] },
  ];

  const categories = [];
  for (const def of definitions) {
    categories.push(
      await prisma.category.create({
        data: { name: def.name, subcategories: { create: def.subcategories.map((name) => ({ name })) } },
        include: { subcategories: true },
      })
    );
  }
  return categories;
}

async function seedSlaConfig() {
  for (const [urgency, hours] of Object.entries(URGENCY_SLA_HOURS)) {
    await prisma.slaConfig.create({
      data: { urgency, firstResponseHours: hours.firstResponseHours, resolutionHours: hours.resolutionHours },
    });
  }
}

async function seedUsers(roles, sectors) {
  const passwordHash = await bcrypt.hash('Senha123!', 10);

  const definitions = [
    { name: 'Ana Souza', email: 'admin@helpdesk.com', roleId: roles.admin.id, sectorId: sectors[0].id },
    { name: 'Beatriz Lima', email: 'gestor1@helpdesk.com', roleId: roles.gestor.id, sectorId: sectors[0].id },
    { name: 'Renato Alves', email: 'gestor2@helpdesk.com', roleId: roles.gestor.id, sectorId: sectors[1].id },
    { name: 'Carla Mendes', email: 'tecnico1@helpdesk.com', roleId: roles.tecnico.id, sectorId: sectors[0].id },
    { name: 'Diego Santos', email: 'tecnico2@helpdesk.com', roleId: roles.tecnico.id, sectorId: sectors[0].id },
    { name: 'Fernanda Costa', email: 'tecnico3@helpdesk.com', roleId: roles.tecnico.id, sectorId: sectors[1].id },
    { name: 'Gustavo Pereira', email: 'tecnico4@helpdesk.com', roleId: roles.tecnico.id, sectorId: sectors[2].id },
    { name: 'Helena Rocha', email: 'usuario1@helpdesk.com', roleId: roles.usuarioFinal.id, sectorId: sectors[0].id },
    { name: 'Igor Martins', email: 'usuario2@helpdesk.com', roleId: roles.usuarioFinal.id, sectorId: sectors[1].id },
    { name: 'Julia Ferreira', email: 'usuario3@helpdesk.com', roleId: roles.usuarioFinal.id, sectorId: sectors[2].id },
  ];

  const users = [];
  for (const def of definitions) {
    users.push(await prisma.user.create({ data: { ...def, passwordHash } }));
  }
  return users;
}

async function createTicketWithTimeline({
  title,
  category,
  subcategory,
  urgency,
  requester,
  assignee,
  sector,
  createdAt,
  finalStatus,
  hadPause,
}) {
  const sla = URGENCY_SLA_HOURS[urgency];
  const slaFirstResponseDeadline = new Date(createdAt.getTime() + sla.firstResponseHours * HOUR_MS);
  const slaResolutionDeadline = new Date(createdAt.getTime() + sla.resolutionHours * HOUR_MS);

  const ticket = await prisma.ticket.create({
    data: {
      title,
      description: `Descrição detalhada do chamado: ${title}.`,
      categoryId: category.id,
      subcategoryId: subcategory.id,
      urgency,
      status: 'ABERTO',
      requesterId: requester.id,
      assignedToId: assignee ? assignee.id : null,
      sectorId: sector.id,
      createdAt,
      slaFirstResponseDeadline,
      slaResolutionDeadline,
    },
  });

  await prisma.ticketTimeLog.create({
    data: { ticketId: ticket.id, eventType: 'CREATED', toStatus: 'ABERTO', authorId: requester.id, occurredAt: createdAt },
  });

  if (finalStatus === 'ABERTO') {
    return ticket;
  }

  const firstResponseAt = new Date(createdAt.getTime() + randomInt(15, 180) * MINUTE_MS);
  await prisma.ticketTimeLog.create({
    data: {
      ticketId: ticket.id,
      eventType: 'FIRST_RESPONSE',
      fromStatus: 'ABERTO',
      toStatus: 'EM_ANDAMENTO',
      authorId: assignee.id,
      occurredAt: firstResponseAt,
    },
  });
  await prisma.ticketTimeLog.create({
    data: {
      ticketId: ticket.id,
      eventType: 'STATUS_CHANGE',
      fromStatus: 'ABERTO',
      toStatus: 'EM_ANDAMENTO',
      authorId: assignee.id,
      occurredAt: firstResponseAt,
    },
  });
  const timeToFirstResponseMinutes = Math.round((firstResponseAt - createdAt) / MINUTE_MS);

  if (finalStatus === 'AGUARDANDO') {
    const pauseStart = new Date(firstResponseAt.getTime() + randomInt(30, 120) * MINUTE_MS);
    await prisma.ticketTimeLog.create({
      data: {
        ticketId: ticket.id,
        eventType: 'PAUSE_START',
        fromStatus: 'EM_ANDAMENTO',
        toStatus: 'AGUARDANDO',
        authorId: assignee.id,
        occurredAt: pauseStart,
      },
    });
    await prisma.ticketTimeLog.create({
      data: {
        ticketId: ticket.id,
        eventType: 'STATUS_CHANGE',
        fromStatus: 'EM_ANDAMENTO',
        toStatus: 'AGUARDANDO',
        authorId: assignee.id,
        occurredAt: pauseStart,
      },
    });
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'AGUARDANDO', firstResponseAt, timeToFirstResponseMinutes },
    });
    return ticket;
  }

  if (finalStatus === 'EM_ANDAMENTO') {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'EM_ANDAMENTO', firstResponseAt, timeToFirstResponseMinutes },
    });
    return ticket;
  }

  let cursor = firstResponseAt;
  let pauseMinutes = 0;

  if (hadPause) {
    const pauseStart = new Date(cursor.getTime() + randomInt(30, 120) * MINUTE_MS);
    const pauseEnd = new Date(pauseStart.getTime() + randomInt(60, 480) * MINUTE_MS);

    await prisma.ticketTimeLog.create({
      data: {
        ticketId: ticket.id,
        eventType: 'PAUSE_START',
        fromStatus: 'EM_ANDAMENTO',
        toStatus: 'AGUARDANDO',
        authorId: assignee.id,
        occurredAt: pauseStart,
      },
    });
    await prisma.ticketTimeLog.create({
      data: {
        ticketId: ticket.id,
        eventType: 'STATUS_CHANGE',
        fromStatus: 'EM_ANDAMENTO',
        toStatus: 'AGUARDANDO',
        authorId: assignee.id,
        occurredAt: pauseStart,
      },
    });
    await prisma.ticketTimeLog.create({
      data: {
        ticketId: ticket.id,
        eventType: 'PAUSE_END',
        fromStatus: 'AGUARDANDO',
        toStatus: 'EM_ANDAMENTO',
        authorId: assignee.id,
        occurredAt: pauseEnd,
      },
    });
    await prisma.ticketTimeLog.create({
      data: {
        ticketId: ticket.id,
        eventType: 'STATUS_CHANGE',
        fromStatus: 'AGUARDANDO',
        toStatus: 'EM_ANDAMENTO',
        authorId: assignee.id,
        occurredAt: pauseEnd,
      },
    });

    pauseMinutes = Math.round((pauseEnd - pauseStart) / MINUTE_MS);
    cursor = pauseEnd;
  }

  const resolvedAt = new Date(cursor.getTime() + randomInt(60, 2880) * MINUTE_MS);
  await prisma.ticketTimeLog.create({
    data: {
      ticketId: ticket.id,
      eventType: 'RESOLVED',
      fromStatus: 'EM_ANDAMENTO',
      toStatus: 'RESOLVIDO',
      authorId: assignee.id,
      occurredAt: resolvedAt,
    },
  });
  await prisma.ticketTimeLog.create({
    data: {
      ticketId: ticket.id,
      eventType: 'STATUS_CHANGE',
      fromStatus: 'EM_ANDAMENTO',
      toStatus: 'RESOLVIDO',
      authorId: assignee.id,
      occurredAt: resolvedAt,
    },
  });
  const timeToResolutionMinutes = Math.round((resolvedAt - createdAt) / MINUTE_MS) - pauseMinutes;

  if (finalStatus === 'RESOLVIDO') {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'RESOLVIDO', firstResponseAt, timeToFirstResponseMinutes, resolvedAt, timeToResolutionMinutes },
    });
    return ticket;
  }

  const closedAt = new Date(resolvedAt.getTime() + randomInt(60, 1440) * MINUTE_MS);
  await prisma.ticketTimeLog.create({
    data: {
      ticketId: ticket.id,
      eventType: 'CLOSED',
      fromStatus: 'RESOLVIDO',
      toStatus: 'FECHADO',
      authorId: assignee.id,
      occurredAt: closedAt,
    },
  });
  await prisma.ticketTimeLog.create({
    data: {
      ticketId: ticket.id,
      eventType: 'STATUS_CHANGE',
      fromStatus: 'RESOLVIDO',
      toStatus: 'FECHADO',
      authorId: assignee.id,
      occurredAt: closedAt,
    },
  });
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      status: 'FECHADO',
      firstResponseAt,
      timeToFirstResponseMinutes,
      resolvedAt,
      timeToResolutionMinutes,
      closedAt,
    },
  });
  return ticket;
}

async function seedTickets(categories, sectors, users) {
  const technicians = users.filter((u) => u.email.startsWith('tecnico'));
  const finalUsers = users.filter((u) => u.email.startsWith('usuario'));
  const urgencies = ['CRITICO', 'ALTO', 'MEDIO', 'BAIXO'];
  const statusPool = ['ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO', 'RESOLVIDO', 'RESOLVIDO', 'FECHADO', 'FECHADO'];
  const now = new Date();

  for (let i = 0; i < 50; i += 1) {
    const category = pick(categories);
    const subcategory = pick(category.subcategories);
    const urgency = pick(urgencies);
    const finalStatus = pick(statusPool);
    const requester = pick(finalUsers);
    const assignee = pick(technicians);
    const sector = sectors.find((s) => s.id === requester.sectorId);
    const createdAt = new Date(now.getTime() - randomInt(0, 30 * 24 * 60) * MINUTE_MS);

    await createTicketWithTimeline({
      title: pick(TICKET_TITLES),
      category,
      subcategory,
      urgency,
      requester,
      assignee: finalStatus === 'ABERTO' ? null : assignee,
      sector,
      createdAt,
      finalStatus,
      hadPause: randomInt(0, 1) === 1,
    });
  }
}

async function seedIdeas(users) {
  for (const def of IDEA_DEFINITIONS) {
    const author = pick(users);
    const idea = await prisma.idea.create({
      data: {
        title: def.title,
        description: `Proposta de melhoria: ${def.title}.`,
        areaImpacted: def.areaImpacted,
        expectedBenefit: def.expectedBenefit,
        authorId: author.id,
        isAnonymous: Math.random() < 0.2,
        status: def.status,
      },
    });

    const voters = users.filter(() => Math.random() < 0.4);
    for (const voter of voters) {
      await prisma.ideaVote.create({ data: { ideaId: idea.id, userId: voter.id } });
    }

    if (def.status !== 'NOVA') {
      const reviewer = pick(users);
      await prisma.ideaComment.create({
        data: { ideaId: idea.id, authorId: reviewer.id, body: `Status atualizado para ${def.status}.` },
      });
    }
  }
}

async function main() {
  await clearDatabase();
  const roles = await seedRolesAndPermissions();
  const sectors = await seedSectors();
  const categories = await seedCategories();
  await seedSlaConfig();
  const users = await seedUsers(roles, sectors);
  await seedTickets(categories, sectors, users);
  await seedIdeas(users);

  console.log('Seed concluído com sucesso.');
  console.log('Login do administrador: admin@helpdesk.com / Senha123!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
