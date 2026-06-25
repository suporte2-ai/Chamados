const prisma = require('../../lib/prisma');

async function list(req, res) {
  const { unreadOnly } = req.query;
  const where = {
    userId: req.user.id,
    ...(unreadOnly === 'true' ? { isRead: false } : {}),
  };

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  res.json(notifications);
}

async function markAllRead(req, res) {
  const result = await prisma.notification.updateMany({
    where: { userId: req.user.id, isRead: false },
    data: { isRead: true },
  });

  res.json({ updated: result.count });
}

async function markRead(req, res) {
  const id = Number(req.params.id);

  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) {
    return res.status(404).json({ error: 'Notificação não encontrada.' });
  }
  if (notification.userId !== req.user.id) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }
  if (notification.isRead) {
    return res.json(notification);
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });

  res.json(updated);
}

module.exports = { list, markAllRead, markRead };
