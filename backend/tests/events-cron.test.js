jest.mock('../src/lib/prisma', () => ({
  eventAttendee: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('../src/lib/notificationService', () => ({
  notifyEventReminder: jest.fn().mockResolvedValue(undefined),
}));

const prisma = require('../src/lib/prisma');
const { notifyEventReminder } = require('../src/lib/notificationService');
const { runCron } = require('../src/lib/eventNotificationCron');

beforeEach(() => {
  jest.clearAllMocks();
});

test('runCron envia notificação de 3 dias e marca notified3d=true', async () => {
  const fakeAttendee3d = { id: 1, userId: 10, event: { id: 5, title: 'Reunião 3d', startAt: new Date() } };
  prisma.eventAttendee.findMany
    .mockResolvedValueOnce([fakeAttendee3d])
    .mockResolvedValueOnce([]);
  prisma.eventAttendee.update.mockResolvedValue({ ...fakeAttendee3d, notified3d: true });

  await runCron();

  expect(prisma.eventAttendee.update).toHaveBeenCalledWith({
    where: { id: 1 },
    data: { notified3d: true },
  });
  expect(notifyEventReminder).toHaveBeenCalledWith(10, fakeAttendee3d.event, 3);
});

test('runCron envia notificação de 1 dia e marca notified1d=true', async () => {
  const fakeAttendee1d = { id: 2, userId: 11, event: { id: 6, title: 'Reunião 1d', startAt: new Date() } };
  prisma.eventAttendee.findMany
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([fakeAttendee1d]);
  prisma.eventAttendee.update.mockResolvedValue({ ...fakeAttendee1d, notified1d: true });

  await runCron();

  expect(prisma.eventAttendee.update).toHaveBeenCalledWith({
    where: { id: 2 },
    data: { notified1d: true },
  });
  expect(notifyEventReminder).toHaveBeenCalledWith(11, fakeAttendee1d.event, 1);
});

test('runCron ignora P2025 silenciosamente (attendee deletado)', async () => {
  const fakeAttendee = { id: 3, userId: 12, event: { id: 7, title: 'Cancelado', startAt: new Date() } };
  prisma.eventAttendee.findMany
    .mockResolvedValueOnce([fakeAttendee])
    .mockResolvedValueOnce([]);

  const p2025 = new Error('Record not found');
  p2025.code = 'P2025';
  prisma.eventAttendee.update.mockRejectedValue(p2025);

  await expect(runCron()).resolves.not.toThrow();
  expect(notifyEventReminder).not.toHaveBeenCalled();
});

test('runCron propaga erros não-P2025 via console.error mas não lança', async () => {
  const fakeAttendee = { id: 4, userId: 13, event: { id: 8, title: 'Erro', startAt: new Date() } };
  prisma.eventAttendee.findMany
    .mockResolvedValueOnce([fakeAttendee])
    .mockResolvedValueOnce([]);

  const genericError = new Error('DB connection lost');
  prisma.eventAttendee.update.mockRejectedValue(genericError);

  const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  await expect(runCron()).resolves.not.toThrow();
  expect(consoleSpy).toHaveBeenCalled();
  consoleSpy.mockRestore();
});
