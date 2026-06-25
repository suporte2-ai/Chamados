const { ticketVisibilityWhere } = require('../src/lib/ticketVisibility');

test('returns an empty filter (sees everything) when the user has view_all_tickets', () => {
  const user = { id: 1, sectorId: 10, permissions: new Set(['view_all_tickets']) };
  expect(ticketVisibilityWhere(user)).toEqual({});
});

test('returns a sector-or-assigned filter when the user has view_sector_tickets', () => {
  const user = { id: 5, sectorId: 10, permissions: new Set(['view_sector_tickets']) };
  expect(ticketVisibilityWhere(user)).toEqual({
    OR: [{ sectorId: 10 }, { assignedToId: 5 }],
  });
});

test('returns a requester-only filter when the user has neither permission', () => {
  const user = { id: 7, sectorId: 10, permissions: new Set([]) };
  expect(ticketVisibilityWhere(user)).toEqual({ requesterId: 7 });
});

test('view_all_tickets takes precedence over view_sector_tickets', () => {
  const user = { id: 3, sectorId: 10, permissions: new Set(['view_all_tickets', 'view_sector_tickets']) };
  expect(ticketVisibilityWhere(user)).toEqual({});
});
