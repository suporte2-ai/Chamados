const { PERMISSION_KEYS, FIELD_KEYS } = require('../src/lib/permissions');

test('exposes the fixed catalog of permission keys', () => {
  expect(PERMISSION_KEYS).toContain('manage_users');
  expect(PERMISSION_KEYS).toContain('view_internal_notes');
  expect(PERMISSION_KEYS).toContain('reopen_tickets');
});

test('exposes the fixed catalog of field visibility keys', () => {
  expect(FIELD_KEYS).toEqual(['assigned_to', 'estimated_cost', 'internal_notes', 'sla_badge']);
});
