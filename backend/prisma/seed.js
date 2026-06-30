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
  'Monitor com tela piscando',
  'Teclado com teclas travadas',
  'HD com barulho estranho',
  'Notebook superaquecendo',
  'Erro ao acessar sistema financeiro',
  'VPN não conecta no home office',
  'Outlook não sincroniza e-mails',
  'Erro de licença no pacote Office',
  'Sistema lento após atualização',
  'Internet instável no setor',
  'Sem acesso à pasta compartilhada',
  'Impressora de rede não encontrada',
  'Wi-Fi cai frequentemente na sala de reunião',
  'Solicitação de novo crachá',
  'Dúvida sobre benefício de saúde',
  'Férias não aprovadas no sistema',
  'Erro no controle de ponto',
  'Pedido de segunda via do holerite',
  'Pedido de reembolso de viagem',
  'NF-e rejeitada pela SEFAZ',
  'Divergência no extrato bancário',
  'Erro no fechamento de caixa',
  'Dúvida sobre adiantamento salarial',
  'Impressora sem tonner',
  'Manutenção do ar-condicionado',
  'Lâmpada queimada na sala 204',
  'Vazamento na copa do 3º andar',
  'Solicitação de cadeira ergonômica',
  'Cafeteira com defeito na cozinha',
];

const COMMENT_BODIES = [
  'Chamado recebido. Iniciando análise.',
  'Aguardando retorno do usuário para prosseguir.',
  'Problema identificado. Aplicando correção.',
  'Necessito de acesso remoto para diagnóstico.',
  'Verificado e corrigido. Por favor, confirme se o problema persiste.',
  'Escalando para o fornecedor.',
  'Peça de reposição solicitada. Prazo: 2 dias úteis.',
  'Usuário confirmou resolução.',
  'Realizei a manutenção preventiva conforme solicitado.',
  'Documento enviado por e-mail separado.',
  'Configuração atualizada. Favor testar.',
  'Aguardando aprovação da gestão para prosseguir.',
];

const INTERNAL_NOTES = [
  'Usuário já abriu chamado similar 3x este mês.',
  'Hardware fora de garantia — avaliar substituição.',
  'Problema recorrente no setor: investigar causa raiz.',
  'Custo pode ser alto — notificar gestor antes de prosseguir.',
];

const IDEA_DEFINITIONS = [
  { title: 'Padronizar respostas automáticas de chamados', areaImpacted: 'TI', expectedBenefit: 'Reduz tempo de primeira resposta em 30%', status: 'IMPLEMENTADA', managerNote: 'Implementado em Jan/2026. Resultados confirmados.' },
  { title: 'Checklist de onboarding para novos colaboradores', areaImpacted: 'RH', expectedBenefit: 'Reduz erros no processo de admissão', status: 'IMPLEMENTADA', managerNote: 'Processo documentado e em uso desde Fev/2026.' },
  { title: 'Aprovação digital de reembolsos', areaImpacted: 'Financeiro', expectedBenefit: 'Agiliza reembolsos em até 2 dias', status: 'EM_IMPLEMENTACAO', managerNote: 'Em desenvolvimento com equipe de TI. Previsão: Jul/2026.' },
  { title: 'App de abertura de chamados via celular', areaImpacted: 'TI', expectedBenefit: 'Facilita abertura de chamados em campo', status: 'EM_IMPLEMENTACAO', managerNote: 'MVP em testes internos. Lançamento previsto para Ago/2026.' },
  { title: 'Base de conhecimento self-service', areaImpacted: 'TI', expectedBenefit: 'Reduz volume de chamados repetitivos em 20%', status: 'APROVADA', managerNote: 'Aprovado em reunião de 10/Jun. Aguardando alocação de equipe.' },
  { title: 'Pesquisa de satisfação pós-fechamento', areaImpacted: 'TI', expectedBenefit: 'Mede qualidade do atendimento', status: 'APROVADA', managerNote: 'Aprovado. Integração com e-mail planejada.' },
  { title: 'Dashboard de gastos por setor', areaImpacted: 'Financeiro', expectedBenefit: 'Melhora visibilidade orçamentária', status: 'APROVADA', managerNote: 'Aprovado pela diretoria financeira em 05/Jun.' },
  { title: 'Manutenção preventiva trimestral de equipamentos', areaImpacted: 'TI', expectedBenefit: 'Reduz chamados corretivos em 40%', status: 'EM_ANALISE', managerNote: null },
  { title: 'Programa de bem-estar para colaboradores', areaImpacted: 'RH', expectedBenefit: 'Reduz absenteísmo', status: 'EM_ANALISE', managerNote: null },
  { title: 'Integração do helpdesk com WhatsApp', areaImpacted: 'TI', expectedBenefit: 'Canal adicional para abertura de chamados', status: 'EM_ANALISE', managerNote: null },
  { title: 'Política de uso consciente de impressoras', areaImpacted: 'Operações', expectedBenefit: 'Reduz custo de tonner em 25%', status: 'EM_ANALISE', managerNote: null },
  { title: 'Revisão do plano de benefícios', areaImpacted: 'RH', expectedBenefit: 'Aumenta satisfação dos colaboradores', status: 'ARQUIVADA', managerNote: 'Arquivado por restrição orçamentária em 2026.' },
  { title: 'Compra de tablets para técnicos de campo', areaImpacted: 'TI', expectedBenefit: 'Aumenta produtividade em atendimentos externos', status: 'ARQUIVADA', managerNote: 'Custo elevado. Revisitar em 2027.' },
  { title: 'Horário flexível para equipe de TI', areaImpacted: 'RH', expectedBenefit: 'Melhora retenção de talentos', status: 'ARQUIVADA', managerNote: 'Não alinhado com política atual da empresa.' },
  { title: 'Treinamento mensal de segurança da informação', areaImpacted: 'TI', expectedBenefit: 'Reduz incidentes de phishing', status: 'NOVA', managerNote: null },
  { title: 'Espaço de descompressão na empresa', areaImpacted: 'RH', expectedBenefit: 'Melhora bem-estar e produtividade', status: 'NOVA', managerNote: null },
  { title: 'Automação de relatórios mensais de TI', areaImpacted: 'TI', expectedBenefit: 'Economiza 4h/mês de trabalho manual', status: 'NOVA', managerNote: null },
  { title: 'Biblioteca de livros técnicos compartilhada', areaImpacted: 'RH', expectedBenefit: 'Incentiva desenvolvimento profissional', status: 'NOVA', managerNote: null },
  { title: 'Painel de status dos sistemas em tempo real', areaImpacted: 'TI', expectedBenefit: 'Reduz chamados de "sistema fora"', status: 'NOVA', managerNote: null },
  { title: 'Revisão do processo de compras de TI', areaImpacted: 'Financeiro', expectedBenefit: 'Reduz tempo de aprovação de 10 para 3 dias', status: 'NOVA', managerNote: null },
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
  await prisma.eventAttendee.deleteMany();
  await prisma.event.deleteMany();
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
      'manage_events',
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
  const names = ['TI', 'RH', 'Financeiro', 'Operações', 'Jurídico'];
  const created = [];
  for (const name of names) {
    created.push(await prisma.sector.create({ data: { name } }));
  }
  const [ti, rh, financeiro, operacoes, juridico] = created;
  return { ti, rh, financeiro, operacoes, juridico };
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
  const { ti, rh, financeiro, operacoes, juridico } = sectors;

  const definitions = [
    { name: 'Ana Souza',       email: 'admin@helpdesk.com',    roleId: roles.admin.id,        sectorId: ti.id },
    { name: 'Beatriz Lima',    email: 'gestor1@helpdesk.com',  roleId: roles.gestor.id,       sectorId: ti.id },
    { name: 'Renato Alves',    email: 'gestor2@helpdesk.com',  roleId: roles.gestor.id,       sectorId: rh.id },
    { name: 'Carla Mendes',    email: 'tecnico1@helpdesk.com', roleId: roles.tecnico.id,      sectorId: ti.id },
    { name: 'Diego Santos',    email: 'tecnico2@helpdesk.com', roleId: roles.tecnico.id,      sectorId: ti.id },
    { name: 'Fernanda Costa',  email: 'tecnico3@helpdesk.com', roleId: roles.tecnico.id,      sectorId: rh.id },
    { name: 'Gustavo Pereira', email: 'tecnico4@helpdesk.com', roleId: roles.tecnico.id,      sectorId: financeiro.id },
    { name: 'Hugo Neves',      email: 'tecnico5@helpdesk.com', roleId: roles.tecnico.id,      sectorId: operacoes.id },
    { name: 'Isabela Moura',   email: 'tecnico6@helpdesk.com', roleId: roles.tecnico.id,      sectorId: rh.id },
    { name: 'Jonas Barbosa',   email: 'tecnico7@helpdesk.com', roleId: roles.tecnico.id,      sectorId: ti.id },
    { name: 'Karen Lopes',     email: 'tecnico8@helpdesk.com', roleId: roles.tecnico.id,      sectorId: financeiro.id },
    { name: 'Helena Rocha',    email: 'usuario1@helpdesk.com', roleId: roles.usuarioFinal.id, sectorId: ti.id },
    { name: 'Igor Martins',    email: 'usuario2@helpdesk.com', roleId: roles.usuarioFinal.id, sectorId: rh.id },
    { name: 'Julia Ferreira',  email: 'usuario3@helpdesk.com', roleId: roles.usuarioFinal.id, sectorId: financeiro.id },
    { name: 'Lucas Oliveira',  email: 'usuario4@helpdesk.com', roleId: roles.usuarioFinal.id, sectorId: operacoes.id },
    { name: 'Marina Castro',   email: 'usuario5@helpdesk.com', roleId: roles.usuarioFinal.id, sectorId: juridico.id },
    { name: 'Nelson Gomes',    email: 'usuario6@helpdesk.com', roleId: roles.usuarioFinal.id, sectorId: ti.id },
    { name: 'Olivia Pinto',    email: 'usuario7@helpdesk.com', roleId: roles.usuarioFinal.id, sectorId: rh.id },
    { name: 'Paulo Ramos',     email: 'usuario8@helpdesk.com', roleId: roles.usuarioFinal.id, sectorId: financeiro.id },
    { name: 'Rafaela Silva',   email: 'usuario9@helpdesk.com', roleId: roles.usuarioFinal.id, sectorId: operacoes.id },
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
    const estimatedCost = Math.random() < 0.2 ? randomInt(50, 2000) : null;
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'RESOLVIDO', firstResponseAt, timeToFirstResponseMinutes, resolvedAt, timeToResolutionMinutes, estimatedCost },
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
  const estimatedCost = Math.random() < 0.2 ? randomInt(50, 2000) : null;
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      status: 'FECHADO',
      firstResponseAt,
      timeToFirstResponseMinutes,
      resolvedAt,
      timeToResolutionMinutes,
      closedAt,
      estimatedCost,
    },
  });
  return ticket;
}

async function seedTickets(users, categories, sectors) {
  const technicians = users.filter((u) => u.email.startsWith('tecnico'));
  const finalUsers = users.filter((u) => u.email.startsWith('usuario'));
  const urgencies = ['CRITICO', 'ALTO', 'MEDIO', 'BAIXO'];
  const statusPool = [
    'ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO',
    'RESOLVIDO', 'RESOLVIDO', 'RESOLVIDO',
    'FECHADO', 'FECHADO', 'FECHADO', 'FECHADO',
  ];
  const sectorList = Object.values(sectors);
  const now = new Date();
  const NINETY_DAYS_MINUTES = 90 * 24 * 60;

  for (let i = 0; i < 200; i += 1) {
    const category = pick(categories);
    const subcategory = pick(category.subcategories);
    const urgency = pick(urgencies);
    const finalStatus = pick(statusPool);
    const requester = pick(finalUsers);
    const assignee = pick(technicians);
    const sector = sectorList.find((s) => s.id === requester.sectorId);
    const createdAt = new Date(now.getTime() - randomInt(0, NINETY_DAYS_MINUTES) * MINUTE_MS);

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

  return prisma.ticket.findMany({
    select: { id: true, title: true, status: true, requesterId: true, assignedToId: true },
    orderBy: { id: 'asc' },
  });
}

async function seedTicketComments(tickets, users) {
  const technicians = users.filter((u) => u.email.startsWith('tecnico'));

  for (const ticket of tickets) {
    if (Math.random() > 0.4) continue;

    const count = randomInt(1, 3);
    const assigneeTech = technicians.find((t) => t.id === ticket.assignedToId) || pick(technicians);
    const requester = users.find((u) => u.id === ticket.requesterId);

    for (let i = 0; i < count; i += 1) {
      const isAssigneeComment = i % 2 === 0;
      const author = isAssigneeComment && ticket.assignedToId ? assigneeTech : requester;
      const isInternal = isAssigneeComment && !!ticket.assignedToId && Math.random() < 0.5;
      const body = isInternal ? pick(INTERNAL_NOTES) : pick(COMMENT_BODIES);

      await prisma.ticketComment.create({
        data: { ticketId: ticket.id, authorId: author.id, body, isInternal },
      });
    }
  }
}

async function seedIdeas(users) {
  const ideas = [];
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
        managerNote: def.managerNote ?? null,
      },
    });

    if (def.status === 'EM_ANALISE') {
      for (const voter of users) {
        if (Math.random() < 0.45) {
          await prisma.ideaVote.create({ data: { ideaId: idea.id, userId: voter.id } });
        }
      }
    }

    ideas.push(idea);
  }
  return ideas;
}

async function seedNotifications(users, tickets, ideas) {
  const demoUsers = users.slice(0, 5);
  const rows = [];

  // TICKET_ASSIGNED (9 ≈ 30%)
  for (let i = 0; i < 9; i += 1) {
    const t = tickets[i % tickets.length];
    rows.push({
      userId: demoUsers[i % demoUsers.length].id,
      type: 'TICKET_ASSIGNED',
      message: `Você foi atribuído ao chamado #${t.id}: ${t.title}`,
      link: `/tickets/${t.id}`,
      isRead: i % 2 === 0,
    });
  }
  // TICKET_STATUS_CHANGED (8 ≈ 25%)
  for (let i = 0; i < 8; i += 1) {
    const t = tickets[(i + 10) % tickets.length];
    rows.push({
      userId: demoUsers[i % demoUsers.length].id,
      type: 'TICKET_STATUS_CHANGED',
      message: `O chamado #${t.id} mudou para ${t.status}`,
      link: `/tickets/${t.id}`,
      isRead: i % 2 === 0,
    });
  }
  // TICKET_COMMENT (7 ≈ 25%)
  for (let i = 0; i < 7; i += 1) {
    const t = tickets[(i + 20) % tickets.length];
    rows.push({
      userId: demoUsers[i % demoUsers.length].id,
      type: 'TICKET_COMMENT',
      message: `Novo comentário no chamado #${t.id}: ${t.title}`,
      link: `/tickets/${t.id}`,
      isRead: i % 2 === 0,
    });
  }
  // IDEA_STATUS_CHANGED (6 ≈ 20%)
  for (let i = 0; i < 6; i += 1) {
    const idea = ideas[i % ideas.length];
    rows.push({
      userId: demoUsers[i % demoUsers.length].id,
      type: 'IDEA_STATUS_CHANGED',
      message: `Sua ideia '${idea.title}' mudou para ${idea.status}`,
      link: `/ideas/${idea.id}`,
      isRead: i % 2 === 0,
    });
  }

  // Ensure exactly 15 read and 15 unread notifications based on global index
  rows.forEach((row, idx) => { row.isRead = idx % 2 === 0; });

  for (const row of rows) {
    await prisma.notification.create({ data: row });
  }
}

async function main() {
  console.log('Iniciando seed rico...');
  await clearDatabase();
  console.log('  Banco limpo.');

  const roles = await seedRolesAndPermissions();
  console.log('  Roles e permissões criados.');

  const sectors = await seedSectors();
  console.log('  5 setores criados.');

  const categories = await seedCategories();
  console.log('  Categorias criadas.');

  await seedSlaConfig();
  console.log('  SLA configs criadas.');

  const users = await seedUsers(roles, sectors);
  console.log(`  ${users.length} usuários criados.`);

  const tickets = await seedTickets(users, categories, sectors);
  console.log(`  ${tickets.length} tickets criados.`);

  await seedTicketComments(tickets, users);
  console.log('  Comentários de tickets criados (~40% dos tickets).');

  const ideas = await seedIdeas(users);
  console.log(`  ${ideas.length} ideias criadas.`);

  await seedNotifications(users, tickets, ideas);
  console.log('  30 notificações criadas.');

  console.log('\nSeed concluído com sucesso!');
  console.log('  admin@helpdesk.com    / Senha123!  (Administrador)');
  console.log('  gestor1@helpdesk.com  / Senha123!  (Gestor - TI)');
  console.log('  gestor2@helpdesk.com  / Senha123!  (Gestor - RH)');
  console.log('  tecnico1@helpdesk.com / Senha123!  (Técnico - TI)');
  console.log('  usuario1@helpdesk.com / Senha123!  (Usuário Final - TI)');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
