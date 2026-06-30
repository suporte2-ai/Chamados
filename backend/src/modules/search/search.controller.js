// backend/src/modules/search/search.controller.js
const prisma = require('../../lib/prisma');
const { ticketVisibilityWhere } = require('../../lib/ticketVisibility');

async function search(req, res) {
  const q = (req.query.q || '').trim();
  if (q.length < 2) {
    return res.json({ tickets: [], events: [], users: [] });
  }

  const ticketIdMatch = /^#?(\d+)$/.test(q) ? Number(q.replace('#', '')) : null;

  const [tickets, events, users] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        AND: [
          ticketVisibilityWhere(req.user),
          {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              ...(ticketIdMatch ? [{ id: ticketIdMatch }] : []),
            ],
          },
        ],
      },
      select: { id: true, title: true, status: true, urgency: true },
      take: 6,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.event.findMany({
      where: {
        attendees: { some: { userId: req.user.id } },
        title: { contains: q, mode: 'insensitive' },
      },
      select: { id: true, title: true, startAt: true },
      take: 4,
      orderBy: { startAt: 'asc' },
    }),
    req.user.permissions.has('manage_users')
      ? prisma.user.findMany({
          where: {
            active: true,
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, name: true, email: true },
          take: 4,
        })
      : Promise.resolve([]),
  ]);

  res.json({ tickets, events, users });
}

module.exports = { search };
