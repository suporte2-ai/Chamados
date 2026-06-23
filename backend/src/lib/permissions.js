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
];

const FIELD_KEYS = ['assigned_to', 'estimated_cost', 'internal_notes', 'sla_badge'];

module.exports = { PERMISSION_KEYS, FIELD_KEYS };
