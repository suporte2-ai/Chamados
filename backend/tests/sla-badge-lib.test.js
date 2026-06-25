const { calculateSlaBadge } = require('../src/lib/slaBadge');

test('returns vermelho when the deadline has already passed for an open ticket', () => {
  const ticket = {
    status: 'EM_ANDAMENTO',
    resolvedAt: null,
    createdAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
    slaResolutionDeadline: new Date(Date.now() - 60 * 60 * 1000),
  };
  expect(calculateSlaBadge(ticket)).toBe('vermelho');
});

test('returns verde when less than 80% of the deadline window has elapsed', () => {
  const createdAt = new Date(Date.now() - 1 * 60 * 60 * 1000);
  const ticket = {
    status: 'ABERTO',
    resolvedAt: null,
    createdAt,
    slaResolutionDeadline: new Date(createdAt.getTime() + 10 * 60 * 60 * 1000),
  };
  expect(calculateSlaBadge(ticket)).toBe('verde');
});

test('returns amarelo when 80% or more of the deadline window has elapsed but not yet passed', () => {
  const createdAt = new Date(Date.now() - 9 * 60 * 60 * 1000);
  const ticket = {
    status: 'EM_ANDAMENTO',
    resolvedAt: null,
    createdAt,
    slaResolutionDeadline: new Date(createdAt.getTime() + 10 * 60 * 60 * 1000),
  };
  expect(calculateSlaBadge(ticket)).toBe('amarelo');
});

test('freezes verde for a resolved ticket that met the deadline, regardless of now()', () => {
  const createdAt = new Date(Date.now() - 100 * 60 * 60 * 1000);
  const ticket = {
    status: 'RESOLVIDO',
    resolvedAt: new Date(createdAt.getTime() + 1 * 60 * 60 * 1000),
    createdAt,
    slaResolutionDeadline: new Date(createdAt.getTime() + 4 * 60 * 60 * 1000),
  };
  expect(calculateSlaBadge(ticket)).toBe('verde');
});

test('freezes vermelho for a resolved ticket that missed the deadline', () => {
  const createdAt = new Date(Date.now() - 100 * 60 * 60 * 1000);
  const ticket = {
    status: 'RESOLVIDO',
    resolvedAt: new Date(createdAt.getTime() + 8 * 60 * 60 * 1000),
    createdAt,
    slaResolutionDeadline: new Date(createdAt.getTime() + 4 * 60 * 60 * 1000),
  };
  expect(calculateSlaBadge(ticket)).toBe('vermelho');
});
