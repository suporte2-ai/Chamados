const FROZEN_STATUSES = ['RESOLVIDO', 'FECHADO'];
const YELLOW_THRESHOLD = 0.8;

function calculateSlaBadge(ticket) {
  if (FROZEN_STATUSES.includes(ticket.status)) {
    return ticket.resolvedAt <= ticket.slaResolutionDeadline ? 'verde' : 'vermelho';
  }

  const now = new Date();
  if (now > ticket.slaResolutionDeadline) {
    return 'vermelho';
  }

  const totalWindowMs = ticket.slaResolutionDeadline.getTime() - ticket.createdAt.getTime();
  const elapsedMs = now.getTime() - ticket.createdAt.getTime();
  const elapsedRatio = totalWindowMs > 0 ? elapsedMs / totalWindowMs : 1;

  return elapsedRatio >= YELLOW_THRESHOLD ? 'amarelo' : 'verde';
}

module.exports = { calculateSlaBadge };
