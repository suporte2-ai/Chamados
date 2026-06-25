const PERMISSION_KEYS = [
  'manage_users',
  'manage_roles',
  'manage_categories',
  'manage_sla',
  'view_performance_panel',
  'view_financial_reports',
  'reassign_tickets',
  'close_tickets',
  'view_internal_notes',
  'view_own_metrics',
  'reopen_tickets',
  'view_all_tickets',
  'view_sector_tickets',
  'update_cost',
];

const FIELD_KEYS = ['assigned_to', 'estimated_cost', 'internal_notes', 'sla_badge'];

function getEnabledPermissionKeys(role) {
  return role.permissions.filter((permission) => permission.enabled).map((permission) => permission.permissionKey);
}

function getVisibleFieldKeys(role) {
  return role.fieldVisibilities.filter((field) => field.visible).map((field) => field.fieldKey);
}

module.exports = { PERMISSION_KEYS, FIELD_KEYS, getEnabledPermissionKeys, getVisibleFieldKeys };
