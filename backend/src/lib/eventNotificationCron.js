const cron = require('node-cron');
const prisma = require('./prisma');
const { notifyEventReminder } = require('./notificationService');

function startOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

async function runCron() {
  const now = new Date();

  const in3Start = startOfDay(addDays(now, 3));
  const in3End   = endOfDay(addDays(now, 3));

  const attendees3d = await prisma.eventAttendee.findMany({
    where: { notified3d: false, event: { startAt: { gte: in3Start, lte: in3End } } },
    include: { event: true },
  });

  for (const a of attendees3d) {
    try {
      await prisma.eventAttendee.update({ where: { id: a.id }, data: { notified3d: true } });
      await notifyEventReminder(a.userId, a.event, 3);
    } catch (err) {
      if (err.code !== 'P2025') console.error('eventCron 3d error:', err);
    }
  }

  const in1Start = startOfDay(addDays(now, 1));
  const in1End   = endOfDay(addDays(now, 1));

  const attendees1d = await prisma.eventAttendee.findMany({
    where: { notified1d: false, event: { startAt: { gte: in1Start, lte: in1End } } },
    include: { event: true },
  });

  for (const a of attendees1d) {
    try {
      await prisma.eventAttendee.update({ where: { id: a.id }, data: { notified1d: true } });
      await notifyEventReminder(a.userId, a.event, 1);
    } catch (err) {
      if (err.code !== 'P2025') console.error('eventCron 1d error:', err);
    }
  }
}

function start() {
  // Executa às 00:05 todo dia
  cron.schedule('5 0 * * *', () => {
    runCron().catch(err => console.error('eventCron fatal error:', err));
  });
}

module.exports = { start, runCron };
