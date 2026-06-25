const { PERMISSION_KEYS, FIELD_KEYS, getEnabledPermissionKeys, getVisibleFieldKeys } = require('../src/lib/permissions');

test('exposes the fixed catalog of permission keys', () => {
  expect(PERMISSION_KEYS).toContain('manage_users');
  expect(PERMISSION_KEYS).toContain('view_internal_notes');
  expect(PERMISSION_KEYS).toContain('reopen_tickets');
});

test('exposes the fixed catalog of field visibility keys', () => {
  expect(FIELD_KEYS).toEqual(['assigned_to', 'estimated_cost', 'internal_notes', 'sla_badge']);
});

test('getEnabledPermissionKeys returns only enabled permission keys', () => {
  const role = {
    permissions: [
      { permissionKey: 'manage_users', enabled: true },
      { permissionKey: 'manage_roles', enabled: false },
    ],
  };
  expect(getEnabledPermissionKeys(role)).toEqual(['manage_users']);
});

test('getVisibleFieldKeys returns only visible field keys', () => {
  const role = {
    fieldVisibilities: [
      { fieldKey: 'estimated_cost', visible: false },
      { fieldKey: 'sla_badge', visible: true },
    ],
  };
  expect(getVisibleFieldKeys(role)).toEqual(['sla_badge']);
});

test('exposes the new ticket-visibility permission keys', () => {
  expect(PERMISSION_KEYS).toContain('view_all_tickets');
  expect(PERMISSION_KEYS).toContain('view_sector_tickets');
});
