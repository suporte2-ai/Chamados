const prisma = require('./prisma');

const TRANSITIONS = {
  ABERTO: ['EM_ANDAMENTO', 'AGUARDANDO', 'RESOLVIDO'],
  EM_ANDAMENTO: ['AGUARDANDO', 'RESOLVIDO'],
  AGUARDANDO: ['EM_ANDAMENTO', 'RESOLVIDO'],
  RESOLVIDO: ['FECHADO', 'EM_ANDAMENTO'],
  FECHADO: [],
};

function isValidTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

function isReopen(from, to) {
  return from === 'RESOLVIDO' && to === 'EM_ANDAMENTO';
}

function hasStatusChangePermission(ticket, newStatus, actor) {
  if (newStatus === 'FECHADO') {
    return actor.permissions.has('close_tickets');
  }
  if (isReopen(ticket.status, newStatus)) {
    return actor.permissions.has('reopen_tickets');
  }
  return actor.id === ticket.assignedToId || actor.permissions.has('reassign_tickets');
}

// Soma os intervalos PAUSE_START -> PAUSE_END já registrados; se houver um
// PAUSE_START sem PAUSE_END correspondente (ticket atualmente em AGUARDANDO),
// conta o intervalo até `asOf` (o `now()` da transição que está fechando a pausa).
async function sumPauseMinutes(ticketId, asOf) {
  const logs = await prisma.ticketTimeLog.findMany({
    where: { ticketId, eventType: { in: ['PAUSE_START', 'PAUSE_END'] } },
    orderBy: { occurredAt: 'asc' },
  });

  let totalMs = 0;
  let openStart = null;
  for (const log of logs) {
    if (log.eventType === 'PAUSE_START') {
      openStart = log.occurredAt;
    } else if (log.eventType === 'PAUSE_END' && openStart) {
      totalMs += log.occurredAt.getTime() - openStart.getTime();
      openStart = null;
    }
  }
  if (openStart) {
    totalMs += asOf.getTime() - openStart.getTime();
  }
  return Math.round(totalMs / 60000);
}

async function applyStatusTransition(ticket, newStatus, actor) {
  if (!isValidTransition(ticket.status, newStatus)) {
    const error = new Error(`Transição inválida de ${ticket.status} para ${newStatus}.`);
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  if (!hasStatusChangePermission(ticket, newStatus, actor)) {
    const error = new Error('Permissão insuficiente para esta transição de status.');
    error.statusCode = 403;
    error.publicMessage = error.message;
    throw error;
  }

  const now = new Date();
  const wasPaused = ticket.status === 'AGUARDANDO';
  const isReopening = isReopen(ticket.status, newStatus);

  const pauseMinutes = newStatus === 'RESOLVIDO' ? await sumPauseMinutes(ticket.id, now) : 0;

  const operations = [];

  if (wasPaused) {
    operations.push(
      prisma.ticketTimeLog.create({
        data: { ticketId: ticket.id, eventType: 'PAUSE_END', fromStatus: 'AGUARDANDO', toStatus: newStatus, authorId: actor.id, occurredAt: now },
      })
    );
  }

  if (newStatus === 'AGUARDANDO') {
    operations.push(
      prisma.ticketTimeLog.create({
        data: { ticketId: ticket.id, eventType: 'PAUSE_START', fromStatus: ticket.status, toStatus: 'AGUARDANDO', authorId: actor.id, occurredAt: now },
      })
    );
  }

  let mainEventType = 'STATUS_CHANGE';
  if (isReopening) mainEventType = 'REOPENED';
  else if (newStatus === 'RESOLVIDO') mainEventType = 'RESOLVED';
  else if (newStatus === 'FECHADO') mainEventType = 'CLOSED';

  operations.push(
    prisma.ticketTimeLog.create({
      data: { ticketId: ticket.id, eventType: mainEventType, fromStatus: ticket.status, toStatus: newStatus, authorId: actor.id, occurredAt: now },
    })
  );

  const data = { status: newStatus };

  if (!ticket.firstResponseAt && ticket.assignedToId && actor.id === ticket.assignedToId) {
    data.firstResponseAt = now;
    data.timeToFirstResponseMinutes = Math.round((now.getTime() - ticket.createdAt.getTime()) / 60000);
    operations.push(
      prisma.ticketTimeLog.create({
        data: { ticketId: ticket.id, eventType: 'FIRST_RESPONSE', fromStatus: ticket.status, toStatus: newStatus, authorId: actor.id, occurredAt: now },
      })
    );
  }

  if (newStatus === 'RESOLVIDO') {
    data.resolvedAt = now;
    data.timeToResolutionMinutes = Math.round((now.getTime() - ticket.createdAt.getTime()) / 60000) - pauseMinutes;
  }

  if (newStatus === 'FECHADO') {
    data.closedAt = now;
  }

  if (isReopening) {
    data.resolvedAt = null;
    data.timeToResolutionMinutes = null;
  }

  operations.push(prisma.ticket.update({ where: { id: ticket.id }, data }));

  const results = await prisma.$transaction(operations);
  return results[results.length - 1];
}

module.exports = { applyStatusTransition };
