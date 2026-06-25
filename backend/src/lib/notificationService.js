const prisma = require('./prisma');

async function notify({ userId, type, message, link }) {
  if (!userId) return;
  await prisma.notification.create({ data: { userId, type, message, link } });
}

async function notifyTicketAssigned(assigneeId, ticket) {
  try {
    await notify({
      userId: assigneeId,
      type: 'TICKET_ASSIGNED',
      message: `Você foi atribuído ao chamado #${ticket.id}: ${ticket.title}`,
      link: `/tickets/${ticket.id}`,
    });
  } catch (err) {
    console.error('notifyTicketAssigned error:', err);
  }
}

async function notifyTicketStatusChanged(requesterId, ticket) {
  try {
    await notify({
      userId: requesterId,
      type: 'TICKET_STATUS_CHANGED',
      message: `O chamado #${ticket.id} mudou para ${ticket.status}`,
      link: `/tickets/${ticket.id}`,
    });
  } catch (err) {
    console.error('notifyTicketStatusChanged error:', err);
  }
}

async function notifyTicketComment(ticket, commentAuthorId, isInternal) {
  try {
    const targets = new Set();
    if (ticket.assignedToId && ticket.assignedToId !== commentAuthorId) {
      targets.add(ticket.assignedToId);
    }
    if (!isInternal && ticket.requesterId && ticket.requesterId !== commentAuthorId) {
      targets.add(ticket.requesterId);
    }
    for (const userId of targets) {
      await notify({
        userId,
        type: 'TICKET_COMMENT',
        message: `Novo comentário no chamado #${ticket.id}: ${ticket.title}`,
        link: `/tickets/${ticket.id}`,
      });
    }
  } catch (err) {
    console.error('notifyTicketComment error:', err);
  }
}

async function notifyTicketReopened(assigneeId, ticket) {
  try {
    await notify({
      userId: assigneeId,
      type: 'TICKET_REOPENED',
      message: `O chamado #${ticket.id} foi reaberto: ${ticket.title}`,
      link: `/tickets/${ticket.id}`,
    });
  } catch (err) {
    console.error('notifyTicketReopened error:', err);
  }
}

async function notifyIdeaStatusChanged(authorId, idea) {
  try {
    await notify({
      userId: authorId,
      type: 'IDEA_STATUS_CHANGED',
      message: `Sua ideia '${idea.title}' mudou para ${idea.status}`,
      link: `/ideas/${idea.id}`,
    });
  } catch (err) {
    console.error('notifyIdeaStatusChanged error:', err);
  }
}

async function notifyIdeaVote(authorId, voterId, idea) {
  try {
    if (voterId === authorId) return;
    await notify({
      userId: authorId,
      type: 'IDEA_VOTE',
      message: `Sua ideia '${idea.title}' recebeu um novo voto`,
      link: `/ideas/${idea.id}`,
    });
  } catch (err) {
    console.error('notifyIdeaVote error:', err);
  }
}

module.exports = {
  notifyTicketAssigned,
  notifyTicketStatusChanged,
  notifyTicketComment,
  notifyTicketReopened,
  notifyIdeaStatusChanged,
  notifyIdeaVote,
};
